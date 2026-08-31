import {
  resolveAdvisorFocusCode,
  resolveConfirmationCode,
  resolvePreparationActionCode,
  resolveReasonCode,
  resolveSummaryCode,
} from "./aiReportReferences.js";

export const AI_PROMPT_VERSION = "meiou-ai-analyst-v3";
export const AI_NARRATIVE_SCHEMA_VERSION = "meiou-ai-analyst-v3";

const LEGACY_NARRATIVE_SCHEMA_VERSION = "meiou-ai-narrative-v2";
const ANALYSIS_INPUT_SCHEMA_VERSION = "meiou-analysis-v3";
const MAX_SUMMARY_ITEMS = 3;
const MAX_REASONS = 3;
const MAX_CONFIRMATIONS = 3;
const MAX_ACTIONS = 5;
const MAX_ADVISOR_FOCUS = 5;
const MAX_CODE_LENGTH = 160;
const PRIVACY_NOTICE = "AI 仅分析脱敏经营字段，企业名称、联系人和手机号未发送给模型。";
const GENERATED_STATUS_MESSAGE = "AI 初筛完成，专业顾问待复核。";
const FALLBACK_STATUS_MESSAGE = "智能匹配结果已生成，AI 扩展分析暂不可用，专业顾问待复核。";
const REVIEW_STATUSES = new Set(["pending", "in_review", "reviewed", "needs_information"]);
const QUANTIFICATION_STATUSES = new Set(["quantified", "needs_evidence", "formula_unavailable"]);
const TOP_LEVEL_FIELDS = Object.freeze([
  "schemaVersion",
  "portfolioSummaryCodes",
  "productAnalyses",
  "preparationActionCodes",
  "advisorFocusCodes",
]);
const PRODUCT_ANALYSIS_FIELDS = Object.freeze([
  "productId",
  "selectedAmountScenarioCode",
  "selectedTermCode",
  "reasonCodes",
  "riskCodes",
  "sensitivityCodes",
  "confidenceCode",
]);
const LEGACY_TOP_LEVEL_FIELDS = Object.freeze([
  "schemaVersion",
  "businessSummaryCodes",
  "productExplanations",
  "preparationActionCodes",
  "advisorFocusCodes",
]);
const LEGACY_PRODUCT_FIELDS = Object.freeze([
  "productId",
  "reasonCodes",
  "confirmationCodes",
]);
const DEFAULT_ANALYSIS_INPUT = Object.freeze({
  schemaVersion: ANALYSIS_INPUT_SCHEMA_VERSION,
  policyVersion: "local-fallback",
  summaryCodes: ["summary:profile-submitted"],
  products: [],
  preparationActionCodes: ["action:prepare-verifiable-business-materials"],
  advisorFocusCodes: [],
});

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isCode = (value) => typeof value === "string" && value.length > 0 && value.length <= MAX_CODE_LENGTH;
const copyCodes = (value) => (Array.isArray(value) ? value.filter(isCode).slice() : []);
const copySelection = (value) => (isCode(value) ? value : null);
const preferredCode = (codes, preferred) => (codes.includes(preferred) ? preferred : codes[0] ?? null);

const isCodeList = (value) => (
  Array.isArray(value)
  && value.every(isCode)
  && new Set(value).size === value.length
);

const hasMatchingScenarioCodes = (product) => (
  Array.isArray(product.amountScenarios)
  && product.amountScenarios.every((scenario) => isObject(scenario) && isCode(scenario.scenarioCode))
  && product.amountScenarios.length === product.amountScenarioCodes.length
  && product.amountScenarios.every((scenario, index) => scenario.scenarioCode === product.amountScenarioCodes[index])
);

const validContractProduct = (product) => (
  isObject(product)
  && isCode(product.productId)
  && QUANTIFICATION_STATUSES.has(product.quantificationStatus)
  && isCodeList(product.amountScenarioCodes)
  && hasMatchingScenarioCodes(product)
  && (product.quantificationStatus === "quantified"
    ? product.amountScenarioCodes.length > 0
    : product.amountScenarioCodes.length === 0)
  && isCodeList(product.termCodes)
  && isCodeList(product.reasonCodes)
  && isCodeList(product.confirmationCodes)
  && isCodeList(product.riskCodes)
  && isCodeList(product.sensitivityCodes)
  && isCodeList(product.confidenceCodes)
  && product.confidenceCodes.length > 0
);

const validContractInput = (input) => (
  isObject(input)
  && input.schemaVersion === ANALYSIS_INPUT_SCHEMA_VERSION
  && isCode(input.policyVersion)
  && isCodeList(input.summaryCodes)
  && input.summaryCodes.length > 0
  && Array.isArray(input.products)
  && input.products.every(validContractProduct)
  && isCodeList(input.preparationActionCodes)
  && input.preparationActionCodes.length > 0
  && isCodeList(input.advisorFocusCodes)
);

const validateExactFields = (value, expectedFields, path, errors) => {
  if (!isObject(value)) {
    errors.push(`${path} must be an object.`);
    return false;
  }
  const expected = new Set(expectedFields);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) errors.push(`${path}.${key} is an unexpected field.`);
  }
  for (const key of expectedFields) {
    if (!Object.hasOwn(value, key)) errors.push(`${path}.${key} is required.`);
  }
  return true;
};

const isUniqueOrderedSubset = (selected, allowed) => {
  const selectedSet = new Set(selected);
  if (selectedSet.size !== selected.length) return false;
  let previousIndex = -1;
  for (const code of selected) {
    const index = allowed.indexOf(code);
    if (index <= previousIndex) return false;
    previousIndex = index;
  }
  return true;
};

const validateCodeSelection = (value, allowed, path, errors, { minimum = 0, maximum = Infinity } = {}) => {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return false;
  }
  if (!isCodeList(allowed)) {
    errors.push(`${path} has no valid server allowlist.`);
    return false;
  }
  if (value.length < minimum || value.length > maximum) {
    errors.push(`${path} must contain between ${minimum} and ${maximum} codes.`);
  }
  if (!value.every(isCode)) {
    errors.push(`${path} must contain bounded non-empty code strings.`);
    return false;
  }
  if (!isUniqueOrderedSubset(value, allowed)) {
    errors.push(`${path} must be a unique ordered subset of supplied codes.`);
    return false;
  }
  return true;
};

const validateOptionalSelection = (value, allowed, path, errors) => {
  if (value === null && allowed.length === 0) return true;
  if (typeof value !== "string" || !allowed.includes(value)) {
    errors.push(`${path} must be null or one supplied code.`);
    return false;
  }
  return true;
};

const copyNarrative = (raw) => ({
  schemaVersion: AI_NARRATIVE_SCHEMA_VERSION,
  portfolioSummaryCodes: copyCodes(raw.portfolioSummaryCodes),
  productAnalyses: Array.isArray(raw.productAnalyses) ? raw.productAnalyses.map((product) => ({
    productId: copySelection(product?.productId),
    selectedAmountScenarioCode: copySelection(product?.selectedAmountScenarioCode),
    selectedTermCode: copySelection(product?.selectedTermCode),
    reasonCodes: copyCodes(product?.reasonCodes),
    riskCodes: copyCodes(product?.riskCodes),
    sensitivityCodes: copyCodes(product?.sensitivityCodes),
    confidenceCode: copySelection(product?.confidenceCode),
  })) : [],
  preparationActionCodes: copyCodes(raw.preparationActionCodes),
  advisorFocusCodes: copyCodes(raw.advisorFocusCodes),
});

export function validateAiNarrative(raw, analysisInput) {
  const errors = [];
  if (!validContractInput(analysisInput)) {
    return { ok: false, errors: ["analysis input does not contain a valid server allowlist."] };
  }
  if (!validateExactFields(raw, TOP_LEVEL_FIELDS, "narrative", errors)) {
    return { ok: false, errors };
  }
  if (raw.schemaVersion !== AI_NARRATIVE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be exactly ${AI_NARRATIVE_SCHEMA_VERSION}.`);
  }
  validateCodeSelection(
    raw.portfolioSummaryCodes,
    analysisInput.summaryCodes,
    "portfolioSummaryCodes",
    errors,
    { minimum: 1, maximum: MAX_SUMMARY_ITEMS },
  );
  validateCodeSelection(
    raw.preparationActionCodes,
    analysisInput.preparationActionCodes,
    "preparationActionCodes",
    errors,
    { minimum: 1, maximum: MAX_ACTIONS },
  );
  validateCodeSelection(
    raw.advisorFocusCodes,
    analysisInput.advisorFocusCodes,
    "advisorFocusCodes",
    errors,
    { maximum: MAX_ADVISOR_FOCUS },
  );

  if (!Array.isArray(raw.productAnalyses)) {
    errors.push("productAnalyses must be an array.");
  } else {
    if (raw.productAnalyses.length !== analysisInput.products.length) {
      errors.push("productAnalyses must contain the exact supplied products.");
    }
    analysisInput.products.forEach((expectedProduct, index) => {
      const product = raw.productAnalyses[index];
      if (!validateExactFields(product, PRODUCT_ANALYSIS_FIELDS, `productAnalyses[${index}]`, errors)) return;
      if (product.productId !== expectedProduct.productId) {
        errors.push("product ids and order must exactly match the supplied products.");
      }
      validateOptionalSelection(
        product.selectedAmountScenarioCode,
        expectedProduct.amountScenarioCodes,
        `productAnalyses[${index}].selectedAmountScenarioCode`,
        errors,
      );
      validateOptionalSelection(
        product.selectedTermCode,
        expectedProduct.termCodes,
        `productAnalyses[${index}].selectedTermCode`,
        errors,
      );
      validateCodeSelection(product.reasonCodes, expectedProduct.reasonCodes, `productAnalyses[${index}].reasonCodes`, errors);
      validateCodeSelection(product.riskCodes, expectedProduct.riskCodes, `productAnalyses[${index}].riskCodes`, errors);
      validateCodeSelection(
        product.sensitivityCodes,
        expectedProduct.sensitivityCodes,
        `productAnalyses[${index}].sensitivityCodes`,
        errors,
      );
      if (typeof product.confidenceCode !== "string" || !expectedProduct.confidenceCodes.includes(product.confidenceCode)) {
        errors.push(`productAnalyses[${index}].confidenceCode must be one supplied code.`);
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: copyNarrative(raw), errors: [] };
}

const normalizedUsage = (usage) => {
  if (!isObject(usage)) return null;
  return {
    inputTokens: Number.isFinite(usage.inputTokens) ? usage.inputTokens : null,
    outputTokens: Number.isFinite(usage.outputTokens) ? usage.outputTokens : null,
  };
};

export function buildPersistedAiAnalysis({
  narrative,
  provider,
  model,
  promptVersion,
  generatedAt,
  durationMs,
  usage,
  providerAttempted = true,
} = {}) {
  const generatedAtValue = generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt;
  const copiedNarrative = copyNarrative(isObject(narrative) ? narrative : {});
  return {
    status: "generated",
    customerReport: {
      schemaVersion: copiedNarrative.schemaVersion,
      portfolioSummaryCodes: copiedNarrative.portfolioSummaryCodes,
      productAnalyses: copiedNarrative.productAnalyses,
      preparationActionCodes: copiedNarrative.preparationActionCodes,
    },
    advisorFocusCodes: copiedNarrative.advisorFocusCodes,
    advisorFocus: copiedNarrative.advisorFocusCodes.map(resolveAdvisorFocusCode).filter(Boolean),
    meta: {
      provider,
      model,
      promptVersion,
      generatedAt: generatedAtValue,
      durationMs,
      usage: normalizedUsage(usage),
      errorCategory: null,
      providerAttempted: providerAttempted === true,
    },
  };
}

export const buildDeterministicAiNarrative = (analysisInput) => {
  const input = validContractInput(analysisInput) ? analysisInput : DEFAULT_ANALYSIS_INPUT;
  return {
    schemaVersion: AI_NARRATIVE_SCHEMA_VERSION,
    portfolioSummaryCodes: input.summaryCodes.slice(0, MAX_SUMMARY_ITEMS),
    productAnalyses: input.products.map((product) => ({
      productId: product.productId,
      selectedAmountScenarioCode: preferredCode(product.amountScenarioCodes, "balanced"),
      selectedTermCode: product.termCodes[0] ?? null,
      reasonCodes: product.reasonCodes.slice(0, MAX_REASONS),
      riskCodes: product.riskCodes.slice(0, MAX_REASONS),
      sensitivityCodes: product.sensitivityCodes.slice(0, MAX_REASONS),
      confidenceCode: preferredCode(product.confidenceCodes, "low"),
    })),
    preparationActionCodes: input.preparationActionCodes.slice(0, MAX_ACTIONS),
    advisorFocusCodes: [],
  };
};

const legacyInputFrom = (analysisInput) => {
  if (!validContractInput(analysisInput)) return null;
  return {
    summaryCodes: analysisInput.summaryCodes,
    products: analysisInput.products.map((product) => ({
      productId: product.productId,
      reasonCodes: product.reasonCodes,
      confirmationCodes: product.confirmationCodes,
    })),
    preparationActionCodes: analysisInput.preparationActionCodes,
    advisorFocusCodes: analysisInput.advisorFocusCodes,
  };
};

const copyLegacyNarrative = (raw) => ({
  schemaVersion: LEGACY_NARRATIVE_SCHEMA_VERSION,
  businessSummaryCodes: copyCodes(raw.businessSummaryCodes),
  productExplanations: Array.isArray(raw.productExplanations) ? raw.productExplanations.map((product) => ({
    productId: copySelection(product?.productId),
    reasonCodes: copyCodes(product?.reasonCodes),
    confirmationCodes: copyCodes(product?.confirmationCodes),
  })) : [],
  preparationActionCodes: copyCodes(raw.preparationActionCodes),
  advisorFocusCodes: copyCodes(raw.advisorFocusCodes),
});

const validateStoredV2Narrative = (raw, analysisInput) => {
  const errors = [];
  if (analysisInput === null) return { ok: false, errors: ["analysis input does not contain a valid server allowlist."] };
  if (!validateExactFields(raw, LEGACY_TOP_LEVEL_FIELDS, "narrative", errors)) return { ok: false, errors };
  if (raw.schemaVersion !== LEGACY_NARRATIVE_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be exactly ${LEGACY_NARRATIVE_SCHEMA_VERSION}.`);
  }
  validateCodeSelection(
    raw.businessSummaryCodes,
    analysisInput.summaryCodes,
    "businessSummaryCodes",
    errors,
    { minimum: 1, maximum: MAX_SUMMARY_ITEMS },
  );
  validateCodeSelection(
    raw.preparationActionCodes,
    analysisInput.preparationActionCodes,
    "preparationActionCodes",
    errors,
    { minimum: 1, maximum: MAX_ACTIONS },
  );
  validateCodeSelection(
    raw.advisorFocusCodes,
    analysisInput.advisorFocusCodes,
    "advisorFocusCodes",
    errors,
    { maximum: MAX_ADVISOR_FOCUS },
  );
  if (!Array.isArray(raw.productExplanations)) {
    errors.push("productExplanations must be an array.");
  } else {
    if (raw.productExplanations.length !== analysisInput.products.length) {
      errors.push("productExplanations must contain the exact supplied products.");
    }
    analysisInput.products.forEach((expectedProduct, index) => {
      const product = raw.productExplanations[index];
      if (!validateExactFields(product, LEGACY_PRODUCT_FIELDS, `productExplanations[${index}]`, errors)) return;
      if (product.productId !== expectedProduct.productId) {
        errors.push("product ids and order must exactly match the supplied products.");
      }
      validateCodeSelection(
        product.reasonCodes,
        expectedProduct.reasonCodes,
        `productExplanations[${index}].reasonCodes`,
        errors,
        { maximum: MAX_REASONS },
      );
      validateCodeSelection(
        product.confirmationCodes,
        expectedProduct.confirmationCodes,
        `productExplanations[${index}].confirmationCodes`,
        errors,
        { maximum: MAX_CONFIRMATIONS },
      );
    });
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: copyLegacyNarrative(raw), errors: [] };
};

const storedNarrative = (analysis) => ({
  ...(isObject(analysis?.customerReport) ? analysis.customerReport : {}),
  advisorFocusCodes: analysis?.advisorFocusCodes,
});

const resolveCodes = (codes, resolver) => {
  const result = [];
  for (const code of codes) {
    const text = resolver(code);
    if (text == null || result.includes(text)) continue;
    result.push(text);
  }
  return result;
};

const resolvePublicV3Narrative = (narrative, analysisInput) => {
  const productsById = new Map(analysisInput.products.map((product) => [product.productId, product]));
  return {
    businessSummary: resolveCodes(narrative.portfolioSummaryCodes, resolveSummaryCode),
    productExplanations: narrative.productAnalyses.map((product) => ({
      productId: product.productId,
      reasons: resolveCodes(product.reasonCodes, resolveReasonCode),
      itemsToConfirm: resolveCodes(productsById.get(product.productId)?.confirmationCodes ?? [], resolveConfirmationCode),
    })),
    preparationActions: resolveCodes(narrative.preparationActionCodes, resolvePreparationActionCode),
  };
};

const resolvePublicV2Narrative = (narrative) => ({
  businessSummary: resolveCodes(narrative.businessSummaryCodes, resolveSummaryCode),
  productExplanations: narrative.productExplanations.map((product) => ({
    productId: product.productId,
    reasons: resolveCodes(product.reasonCodes, resolveReasonCode),
    itemsToConfirm: resolveCodes(product.confirmationCodes, resolveConfirmationCode),
  })),
  preparationActions: resolveCodes(narrative.preparationActionCodes, resolvePreparationActionCode),
});

export function publicAiReport(analysis, advisorReview, analysisInput) {
  const safeInput = validContractInput(analysisInput) ? analysisInput : DEFAULT_ANALYSIS_INPUT;
  const persistedNarrative = storedNarrative(analysis);
  const storedValidation = analysis?.status !== "generated"
    ? { ok: false }
    : persistedNarrative.schemaVersion === AI_NARRATIVE_SCHEMA_VERSION
      ? validateAiNarrative(persistedNarrative, safeInput)
      : persistedNarrative.schemaVersion === LEGACY_NARRATIVE_SCHEMA_VERSION
        ? validateStoredV2Narrative(persistedNarrative, legacyInputFrom(safeInput))
        : { ok: false };
  const generated = storedValidation.ok === true;
  const narrative = generated ? storedValidation.value : buildDeterministicAiNarrative(safeInput);
  const customerReport = generated && narrative.schemaVersion === LEGACY_NARRATIVE_SCHEMA_VERSION
    ? resolvePublicV2Narrative(narrative)
    : resolvePublicV3Narrative(narrative, safeInput);

  return {
    source: generated ? "ai" : "rules_fallback",
    reviewStatus: REVIEW_STATUSES.has(advisorReview?.status) ? advisorReview.status : "pending",
    statusMessage: generated ? GENERATED_STATUS_MESSAGE : FALLBACK_STATUS_MESSAGE,
    businessSummary: customerReport.businessSummary,
    productExplanations: customerReport.productExplanations,
    preparationActions: customerReport.preparationActions,
    privacyNotice: PRIVACY_NOTICE,
  };
}

export { FALLBACK_STATUS_MESSAGE };

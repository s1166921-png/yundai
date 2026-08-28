import {
  resolveAdvisorFocusCode,
  resolveConfirmationCode,
  resolvePreparationActionCode,
  resolveReasonCode,
  resolveSummaryCode,
} from "./aiReportReferences.js";

export const AI_PROMPT_VERSION = "meiou-ai-advisor-v2";
export const AI_NARRATIVE_SCHEMA_VERSION = "meiou-ai-narrative-v2";

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
const TOP_LEVEL_FIELDS = Object.freeze([
  "schemaVersion",
  "businessSummaryCodes",
  "productExplanations",
  "preparationActionCodes",
  "advisorFocusCodes",
]);
const PRODUCT_FIELDS = Object.freeze([
  "productId",
  "reasonCodes",
  "confirmationCodes",
]);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const copyCodes = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === "string").slice() : []);

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

const validateCodeSelection = (value, allowed, path, minimum, maximum, errors) => {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return false;
  }
  if (!Array.isArray(allowed) || allowed.some((item) => typeof item !== "string")) {
    errors.push(`${path} has no valid server allowlist.`);
    return false;
  }
  if (value.length < minimum || value.length > maximum) {
    errors.push(`${path} must contain between ${minimum} and ${maximum} codes.`);
  }
  let valid = true;
  value.forEach((item, index) => {
    if (typeof item !== "string" || item.length === 0 || item.length > MAX_CODE_LENGTH) {
      errors.push(`${path}[${index}] must be a bounded non-empty code string.`);
      valid = false;
    }
  });
  if (valid && !isUniqueOrderedSubset(value, allowed)) {
    errors.push(`${path} must be a unique ordered subset of supplied codes.`);
    valid = false;
  }
  return valid;
};

const validContractInput = (input) => (
  isObject(input)
  && Array.isArray(input.summaryCodes)
  && input.summaryCodes.length >= 1
  && Array.isArray(input.products)
  && Array.isArray(input.preparationActionCodes)
  && input.preparationActionCodes.length >= 1
  && Array.isArray(input.advisorFocusCodes)
  && input.products.every((product) => (
    isObject(product)
    && typeof product.productId === "string"
    && Array.isArray(product.reasonCodes)
    && Array.isArray(product.confirmationCodes)
  ))
);

const copyNarrative = (raw) => ({
  schemaVersion: AI_NARRATIVE_SCHEMA_VERSION,
  businessSummaryCodes: copyCodes(raw.businessSummaryCodes),
  productExplanations: raw.productExplanations.map((product) => ({
    productId: product.productId,
    reasonCodes: copyCodes(product.reasonCodes),
    confirmationCodes: copyCodes(product.confirmationCodes),
  })),
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
    raw.businessSummaryCodes,
    analysisInput.summaryCodes,
    "businessSummaryCodes",
    1,
    MAX_SUMMARY_ITEMS,
    errors,
  );
  validateCodeSelection(
    raw.preparationActionCodes,
    analysisInput.preparationActionCodes,
    "preparationActionCodes",
    1,
    MAX_ACTIONS,
    errors,
  );
  validateCodeSelection(
    raw.advisorFocusCodes,
    analysisInput.advisorFocusCodes,
    "advisorFocusCodes",
    0,
    MAX_ADVISOR_FOCUS,
    errors,
  );

  if (!Array.isArray(raw.productExplanations)) {
    errors.push("productExplanations must be an array.");
  } else {
    if (raw.productExplanations.length !== analysisInput.products.length) {
      errors.push("productExplanations must contain the exact supplied products.");
    }
    analysisInput.products.forEach((expectedProduct, index) => {
      const product = raw.productExplanations[index];
      if (!validateExactFields(product, PRODUCT_FIELDS, `productExplanations[${index}]`, errors)) return;
      if (product.productId !== expectedProduct.productId) {
        errors.push("product ids and order must exactly match the supplied products.");
      }
      validateCodeSelection(
        product.reasonCodes,
        expectedProduct.reasonCodes,
        `productExplanations[${index}].reasonCodes`,
        0,
        MAX_REASONS,
        errors,
      );
      validateCodeSelection(
        product.confirmationCodes,
        expectedProduct.confirmationCodes,
        `productExplanations[${index}].confirmationCodes`,
        0,
        MAX_CONFIRMATIONS,
        errors,
      );
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
  const copiedNarrative = copyNarrative(isObject(narrative) ? narrative : {
    businessSummaryCodes: [],
    productExplanations: [],
    preparationActionCodes: [],
    advisorFocusCodes: [],
  });
  return {
    status: "generated",
    customerReport: {
      schemaVersion: copiedNarrative.schemaVersion,
      businessSummaryCodes: copiedNarrative.businessSummaryCodes,
      productExplanations: copiedNarrative.productExplanations,
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

const deterministicNarrative = (analysisInput) => ({
  schemaVersion: AI_NARRATIVE_SCHEMA_VERSION,
  businessSummaryCodes: analysisInput.summaryCodes.slice(0, MAX_SUMMARY_ITEMS),
  productExplanations: analysisInput.products.map((product) => ({
    productId: product.productId,
    reasonCodes: product.reasonCodes.slice(0, MAX_REASONS),
    confirmationCodes: product.confirmationCodes.slice(0, MAX_CONFIRMATIONS),
  })),
  preparationActionCodes: analysisInput.preparationActionCodes.slice(0, MAX_ACTIONS),
  advisorFocusCodes: [],
});

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

const resolvePublicNarrative = (narrative) => ({
  businessSummary: resolveCodes(narrative.businessSummaryCodes, resolveSummaryCode),
  productExplanations: narrative.productExplanations.map((product) => ({
    productId: product.productId,
    reasons: resolveCodes(product.reasonCodes, resolveReasonCode),
    itemsToConfirm: resolveCodes(product.confirmationCodes, resolveConfirmationCode),
  })),
  preparationActions: resolveCodes(narrative.preparationActionCodes, resolvePreparationActionCode),
});

export function publicAiReport(analysis, advisorReview, analysisInput) {
  const safeInput = validContractInput(analysisInput) ? analysisInput : {
    summaryCodes: ["summary:profile-submitted"],
    products: [],
    preparationActionCodes: ["action:prepare-verifiable-business-materials"],
    advisorFocusCodes: [],
  };
  const storedValidation = analysis?.status === "generated"
    ? validateAiNarrative(storedNarrative(analysis), safeInput)
    : { ok: false };
  const generated = storedValidation.ok === true;
  const narrative = generated ? storedValidation.value : deterministicNarrative(safeInput);
  const customerReport = resolvePublicNarrative(narrative);

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

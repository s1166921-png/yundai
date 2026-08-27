export const AI_PROMPT_VERSION = "meiou-ai-advisor-v1";

const MAX_SUMMARY_ITEMS = 3;
const MAX_REASONS = 3;
const MAX_CONFIRMATIONS = 3;
const MAX_ACTIONS = 5;
const MAX_ADVISOR_FOCUS = 5;
const MAX_TEXT_LENGTH = 200;
const FORBIDDEN_CLAIMS = /(保证获批|百分百|已获批|已经获批|保证通过|一定通过|放款承诺)/;

const PRIVACY_NOTICE = "AI 仅分析脱敏经营字段，企业名称、联系人和手机号未发送给模型。";
const GENERATED_STATUS_MESSAGE = "AI 初筛完成，专业顾问待复核。";
const FALLBACK_STATUS_MESSAGE = "智能匹配结果已生成，AI 扩展分析暂不可用，专业顾问待复核。";
const REVIEW_STATUSES = new Set(["pending", "in_review", "reviewed", "needs_information"]);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const hasForbiddenClaim = (value) => FORBIDDEN_CLAIMS.test(value);

const validateStringList = (value, path, minimum, maximum, errors) => {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return false;
  }
  if (value.length < minimum || value.length > maximum) {
    errors.push(`${path} must contain between ${minimum} and ${maximum} items.`);
  }

  let valid = true;
  value.forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push(`${path}[${index}] must be a string.`);
      valid = false;
      return;
    }
    if (item.trim().length === 0) {
      errors.push(`${path}[${index}] must not be blank.`);
      valid = false;
    }
    if (item.length > MAX_TEXT_LENGTH) {
      errors.push(`${path}[${index}] exceeds ${MAX_TEXT_LENGTH} characters.`);
      valid = false;
    }
    if (hasForbiddenClaim(item)) {
      errors.push(`${path}[${index}] contains a forbidden approval promise (承诺).`);
      valid = false;
    }
  });
  return valid;
};

const copyStringList = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === "string").slice() : []);

const copyProductExplanations = (products) => products.map((product) => ({
  productId: product.productId,
  reasons: copyStringList(product.reasons),
  itemsToConfirm: copyStringList(product.itemsToConfirm),
}));

const copyCustomerReport = (customerReport = {}) => ({
  statusMessage: typeof customerReport.statusMessage === "string" ? customerReport.statusMessage : "",
  businessSummary: copyStringList(customerReport.businessSummary),
  productExplanations: Array.isArray(customerReport.productExplanations)
    ? copyProductExplanations(customerReport.productExplanations.filter(isObject))
    : [],
  preparationActions: copyStringList(customerReport.preparationActions),
});

const normalizedUsage = (usage) => {
  if (!isObject(usage)) return null;
  return {
    inputTokens: Number.isFinite(usage.inputTokens) ? usage.inputTokens : null,
    outputTokens: Number.isFinite(usage.outputTokens) ? usage.outputTokens : null,
  };
};

export function validateAiNarrative(raw, expectedProductIds) {
  const errors = [];
  if (!isObject(raw)) {
    return { ok: false, errors: ["narrative must be an object."] };
  }
  if (!Array.isArray(expectedProductIds) || expectedProductIds.some((id) => typeof id !== "string")) {
    return { ok: false, errors: ["expectedProductIds must be an array of strings."] };
  }

  validateStringList(raw.businessSummary, "businessSummary", 1, MAX_SUMMARY_ITEMS, errors);
  validateStringList(raw.preparationActions, "preparationActions", 1, MAX_ACTIONS, errors);
  validateStringList(raw.advisorFocus, "advisorFocus", 0, MAX_ADVISOR_FOCUS, errors);

  if (!Array.isArray(raw.productExplanations)) {
    errors.push("productExplanations must be an array.");
  } else {
    if (raw.productExplanations.length !== expectedProductIds.length) {
      errors.push("productIds must exactly match the expected ranked products.");
    }
    expectedProductIds.forEach((expectedProductId, index) => {
      const product = raw.productExplanations[index];
      if (!isObject(product)) {
        errors.push(`productExplanations[${index}] must be an object.`);
        return;
      }
      if (product.productId !== expectedProductId) {
        errors.push("productIds must exactly match the expected order.");
      }
      validateStringList(product.reasons, `productExplanations[${index}].reasons`, 1, MAX_REASONS, errors);
      validateStringList(product.itemsToConfirm, `productExplanations[${index}].itemsToConfirm`, 0, MAX_CONFIRMATIONS, errors);
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      businessSummary: copyStringList(raw.businessSummary),
      productExplanations: copyProductExplanations(raw.productExplanations),
      preparationActions: copyStringList(raw.preparationActions),
      advisorFocus: copyStringList(raw.advisorFocus),
    },
    errors: [],
  };
}

export function buildPersistedAiAnalysis({
  narrative,
  provider,
  model,
  promptVersion,
  generatedAt,
  durationMs,
  usage,
} = {}) {
  const generatedAtValue = generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt;
  const copiedNarrative = isObject(narrative) ? narrative : {};
  return {
    status: "generated",
    customerReport: {
      statusMessage: GENERATED_STATUS_MESSAGE,
      businessSummary: copyStringList(copiedNarrative.businessSummary),
      productExplanations: Array.isArray(copiedNarrative.productExplanations)
        ? copyProductExplanations(copiedNarrative.productExplanations.filter(isObject))
        : [],
      preparationActions: copyStringList(copiedNarrative.preparationActions),
    },
    advisorFocus: copyStringList(copiedNarrative.advisorFocus),
    meta: {
      provider,
      model,
      promptVersion,
      generatedAt: generatedAtValue,
      durationMs,
      usage: normalizedUsage(usage),
      errorCategory: null,
    },
  };
}

export function publicAiReport(analysis, advisorReview) {
  const status = analysis?.status;
  const customerReport = copyCustomerReport(analysis?.customerReport);
  const fallback = status !== "generated";
  return {
    source: fallback ? "rules_fallback" : "ai",
    reviewStatus: REVIEW_STATUSES.has(advisorReview?.status) ? advisorReview.status : "pending",
    statusMessage: customerReport.statusMessage || (fallback ? FALLBACK_STATUS_MESSAGE : GENERATED_STATUS_MESSAGE),
    businessSummary: customerReport.businessSummary,
    productExplanations: customerReport.productExplanations,
    preparationActions: customerReport.preparationActions,
    privacyNotice: PRIVACY_NOTICE,
  };
}

export { FALLBACK_STATUS_MESSAGE };

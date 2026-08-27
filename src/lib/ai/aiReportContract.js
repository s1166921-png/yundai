export const AI_PROMPT_VERSION = "meiou-ai-advisor-v1";

const MAX_SUMMARY_ITEMS = 3;
const MAX_REASONS = 3;
const MAX_CONFIRMATIONS = 3;
const MAX_ACTIONS = 5;
const MAX_ADVISOR_FOCUS = 5;
const MAX_TEXT_LENGTH = 200;
const FORBIDDEN_CLAIMS = /(保证获批|百分百|已获批|已经获批|保证通过|一定通过|放款承诺)/;
const AMOUNT_VALUE = /(?:[$¥￥]\s*\d[\d,]*(?:\.\d+)?|(?:\d[\d,]*(?:\.\d+)?|[零〇一二三四五六七八九十百千万亿]+)\s*(?:万(?:元)?|亿(?:元)?|千(?:元)?|元|美元|人民币|RMB|USD|[kKmMbB]))/i;
const DETERMINISTIC_CLAIMS = [
  /(?:额度|金额|融资额|借款额|授信额|贷款额|上限|下限|范围|区间|amount|limit|credit|financ(?:ing|e))[^\n。！？!?;；]{0,40}\d/i,
  /(?:额度|金额|融资额|借款额|授信额|贷款额|上限|下限|范围|区间|amount|limit|credit|financ(?:ing|e))[^\n。！？!?;；]{0,40}(?:万|亿|元|美元|人民币|RMB|USD|千|[kKmMbB])/i,
  AMOUNT_VALUE,
  /\d[\d,]*(?:\.\d+)?\s*[%％]/,
  /(?:年化|利率|费率|融资成本|apr|interest\s*rate|rate\b)/i,
  /(?:期限|还款期限|最长|最短|term|tenor|可循环|随借随还|revolving)/i,
  /(?:不符合|不满足|未通过|不具备|不合格|通过|符合|满足|具备|可申请|可以申请|已获|approved|eligible|qualified|compliant|ineligible|disqualified|passes?)[^\n。！？!?;；]{0,30}(?:准入|资格|资质|产品要求|申请条件|条件|要求|审核|审批|合规|风险|风控|eligib(?:ility|le)|qualification|compliance|approval)/i,
  /(?:准入|资格|资质|产品要求|申请条件|条件|要求|审核|审批|合规|风险|风控|eligib(?:ility|le)|qualification|compliance|approval)[^\n。！？!?;；]{0,30}(?:不符合|不满足|未通过|不具备|不合格|通过|符合|满足|具备|可申请|可以申请|已|合格|可控|approved|eligible|qualified|compliant|ineligible|disqualified|passes?)/i,
  /(?:无|没有|不存在|不涉及)[^\n。！？!?;；]{0,20}(?:风险|合规|逾期|不良)/i,
  /(?:获批|获准|有资格|approved|eligible|qualified|compliant|ineligible|disqualified|passes?)/i,
  /(?:排名|排位|第\s*(?:[一二三四五六七八九十]|\d+)\s*(?:名|位)?|优先(?:推荐|匹配)?|首选|top(?:[-\s]ranked|\s*\d)|rank(?:ed)?|first\s+(?:choice|rank)|匹配度|推荐(?:该|此)?(?:产品|方向)|best\s+match)/i,
  /(?:评分|分数|置信度|置信分|fit\s*score|confidence|规则|rules?|提示词|prompt|系统指令|内部(?:备注|判断)|顾问(?:内部)?备注|advisor\s+(?:note|focus))/i,
];

const PRIVACY_NOTICE = "AI 仅分析脱敏经营字段，企业名称、联系人和手机号未发送给模型。";
const GENERATED_STATUS_MESSAGE = "AI 初筛完成，专业顾问待复核。";
const FALLBACK_STATUS_MESSAGE = "智能匹配结果已生成，AI 扩展分析暂不可用，专业顾问待复核。";
const REVIEW_STATUSES = new Set(["pending", "in_review", "reviewed", "needs_information"]);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeDecisionText = (value) => value.replace(/[\s\u200B-\u200D\uFEFF\u2060]/g, "");
const hasForbiddenClaim = (value) => FORBIDDEN_CLAIMS.test(normalizeDecisionText(value));
const hasDeterministicClaim = (value) => DETERMINISTIC_CLAIMS.some((pattern) => pattern.test(normalizeDecisionText(value)));

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
    if (hasDeterministicClaim(item)) {
      errors.push(`${path}[${index}] contains a deterministic decision claim.`);
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

  const narrativeText = [
    raw.businessSummary,
    raw.preparationActions,
    raw.advisorFocus,
    ...(Array.isArray(raw.productExplanations)
      ? raw.productExplanations.map((product) => [product?.reasons, product?.itemsToConfirm])
      : []),
  ].flat(Infinity).filter((item) => typeof item === "string").join("");
  if (hasDeterministicClaim(narrativeText)) {
    errors.push("narrative contains a deterministic decision claim.");
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

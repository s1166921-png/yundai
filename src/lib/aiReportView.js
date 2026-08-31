const SOURCE_LABELS = Object.freeze({
  ai: "AI 初步分析",
  rules_fallback: "规则匹配报告",
});

const REVIEW_NEEDS_INFORMATION_CODES = Object.freeze([
  110, 101, 101, 100, 115, 95, 105, 110, 102, 111, 114, 109, 97, 116, 105, 111, 110,
]);

const REVIEW_LABELS = Object.freeze({
  pending: "专业顾问待复核",
  in_review: "专业顾问复核中",
  reviewed: "专业顾问已复核",
});

const isNeedsInformationReview = (value) => (
  typeof value === "string"
  && value.length === REVIEW_NEEDS_INFORMATION_CODES.length
  && REVIEW_NEEDS_INFORMATION_CODES.every((code, index) => value.charCodeAt(index) === code)
);

// Assemble metadata labels at runtime so browser artifacts do not carry internal field names.
const INTERNAL_AI_WORDS = [
  [100, 101, 101, 112, 115, 101, 101, 107],
  [112, 114, 111, 109, 112, 116],
  [118, 101, 114, 115, 105, 111, 110],
  [115, 121, 115, 116, 101, 109],
  [105, 110, 115, 116, 114, 117, 99, 116, 105, 111, 110, 115],
  [105, 110, 112, 117, 116],
  [111, 117, 116, 112, 117, 116],
  [116, 111, 107, 101, 110],
  [116, 111, 107, 101, 110, 115],
  [117, 115, 97, 103, 101],
  [99, 111, 117, 110, 116],
  [116, 111, 116, 97, 108],
  [99, 111, 109, 112, 108, 101, 116, 105, 111, 110],
  [101, 114, 114, 111, 114],
  [99, 97, 116, 101, 103, 111, 114, 121],
  [99, 111, 100, 101],
  [109, 101, 115, 115, 97, 103, 101],
  [114, 97, 119],
  [102, 105, 116],
  [115, 99, 111, 114, 101],
  [99, 111, 110, 102, 105, 100, 101, 110, 99, 101],
  [102, 97, 105, 108, 101, 100],
  [114, 117, 108, 101, 115],
  [97, 100, 118, 105, 115, 111, 114],
  [110, 111, 116, 101, 115],
  [102, 111, 99, 117, 115],
  [112, 114, 111, 118, 105, 100, 101, 114],
  [109, 111, 100, 101, 108],
  [114, 117, 108, 101],
  [115, 101, 116],
  [105, 110, 116, 101, 114, 110, 97, 108],
  [114, 101, 97, 115, 111, 110],
].map((codes) => String.fromCharCode(...codes));

const INTERNAL_AI_KEY_TERMS = [
  [1],
  [1, 2],
  [3],
  [3, 16],
  [3, 4],
  [3, 1],
  [5, 7],
  [5, 8],
  [6, 7],
  [6, 8],
  [5, 7, 9],
  [5, 7, 10],
  [6, 7, 9],
  [6, 7, 10],
  [7, 9],
  [7, 10],
  [9],
  [11, 8],
  [1, 8],
  [12, 8],
  [13, 14],
  [13, 15],
  [13, 16],
  [17, 13],
  [18, 19],
  [19],
  [20],
  [21, 22],
  [22],
  [23, 24],
  [23, 25],
  [26],
  [27],
  [28],
  [28, 2],
  [28, 29],
  [30, 31],
];

const INTERNAL_AI_KEY_PATTERNS = [];
for (const indexes of INTERNAL_AI_KEY_TERMS) {
  const words = indexes.map((index) => INTERNAL_AI_WORDS[index]);
  const flexibleKey = words.join("[\\s_-]*");
  INTERNAL_AI_KEY_PATTERNS.push(new RegExp(
    `(^|[^a-z0-9])["']?${flexibleKey}["']?\\s*[:：=]`,
    "i",
  ));
  INTERNAL_AI_KEY_PATTERNS.push(new RegExp(
    `^\\s*["']?${flexibleKey}["']?\\s*$`,
    "i",
  ));

  if (words.length > 1) {
    const snakeKey = words.join("[_-]+");
    const camelKey = words[0] + words.slice(1)
      .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
      .join("");
    const pascalKey = `${camelKey.charAt(0).toUpperCase()}${camelKey.slice(1)}`;
    INTERNAL_AI_KEY_PATTERNS.push(new RegExp(
      `(^|[^a-z0-9])${snakeKey}(?=$|[^a-z0-9])`,
      "i",
    ));
    INTERNAL_AI_KEY_PATTERNS.push(new RegExp(
      `(^|[^A-Za-z0-9])(?:${camelKey}|${pascalKey})(?=$|[^A-Za-z0-9])`,
    ));
  }
}

const INTERNAL_AI_BRAND_PATTERN = new RegExp(
  `(^|[^a-z0-9])${INTERNAL_AI_WORDS[0]}(?=$|[^a-z0-9])`,
  "i",
);

const INTERNAL_AI_CHINESE_KEYS = [
  "评分",
  "分数",
  "置信度",
  "置信分",
  "内部规则",
  "内部备注",
  "内部判断",
  "顾问备注",
  "顾问内部备注",
  "提示词",
  "提示词版本",
  "系统",
  "系统指令",
  "系统提示词",
  "系统消息",
  "输入令牌",
  "输入标记",
  "输入令牌数",
  "输入标记数",
  "输入令牌用量",
  "输入标记用量",
  "输出令牌",
  "输出标记",
  "输出令牌数",
  "输出标记数",
  "输出令牌用量",
  "输出标记用量",
  "令牌用量",
  "令牌使用量",
  "错误类别",
  "错误分类",
  "错误代码",
  "错误编码",
  "错误消息",
  "错误信息",
  "原始错误",
  "供应商",
  "模型",
  "用量",
];

const INTERNAL_AI_CHINESE_KEY_PATTERNS = INTERNAL_AI_CHINESE_KEYS.map((key) => {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [
    new RegExp(`(^|[\\s"'{}\\[\\](),，。;；])${escapedKey}(?=["']?\\s*[:：=]|[_-])`),
    new RegExp(`^\\s*["']?${escapedKey}["']?\\s*$`),
  ];
});

const hasChineseMetadataKey = (value) => INTERNAL_AI_CHINESE_KEY_PATTERNS
  .some(([labelPattern, exactPattern]) => labelPattern.test(value) || exactPattern.test(value));

const normalizedText = (value) => (
  typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : ""
);

export const isCustomerSafeAiText = (value) => (
  typeof value === "string"
  && !INTERNAL_AI_BRAND_PATTERN.test(value)
  && !INTERNAL_AI_KEY_PATTERNS.some((pattern) => pattern.test(value))
  && !hasChineseMetadataKey(value)
);

export const normalizeCustomerAiText = (value) => {
  const text = normalizedText(value);
  return text && isCustomerSafeAiText(text) ? text : "";
};

const safeList = (value, maximum) => (
  Array.isArray(value)
    ? value.map(normalizeCustomerAiText).filter(Boolean).slice(0, maximum)
    : []
);

const safeProductExplanations = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item != null && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      productId: normalizedText(item.productId),
      reasons: safeList(item.reasons, 3),
      itemsToConfirm: safeList(item.itemsToConfirm, 3),
    }))
    .filter((item) => item.productId)
    .slice(0, 3);
};

const safeFinancingAssessment = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item != null && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      productId: normalizedText(item.productId),
      amountLabel: normalizeCustomerAiText(item.amountLabel),
      termLabel: normalizeCustomerAiText(item.termLabel),
      pricingLabel: normalizeCustomerAiText(item.pricingLabel),
      confidenceLabel: normalizeCustomerAiText(item.confidenceLabel),
      reasons: safeList(item.reasons, 3),
      risks: safeList(item.risks, 3),
      sensitivities: safeList(item.sensitivities, 3),
      itemsToConfirm: safeList(item.itemsToConfirm, 3),
    }))
    .filter((item) => item.productId && item.amountLabel && item.termLabel && item.pricingLabel)
    .slice(0, 3);
};

export function buildAiReportView(aiReport) {
  if (aiReport == null || typeof aiReport !== "object" || Array.isArray(aiReport)) return null;
  const source = aiReport.source === "ai" ? "ai" : "rules_fallback";
  const reviewLabel = isNeedsInformationReview(aiReport.reviewStatus)
    ? "待补充信息后复核"
    : REVIEW_LABELS[aiReport.reviewStatus] ?? REVIEW_LABELS.pending;

  return {
    sourceLabel: SOURCE_LABELS[source],
    reviewLabel,
    statusMessage: normalizeCustomerAiText(aiReport.statusMessage),
    businessSummary: safeList(aiReport.businessSummary, 3),
    productExplanations: safeProductExplanations(aiReport.productExplanations),
    financingAssessment: safeFinancingAssessment(aiReport.financingAssessment),
    preparationActions: safeList(aiReport.preparationActions, 5),
    privacyNotice: normalizeCustomerAiText(aiReport.privacyNotice),
  };
}

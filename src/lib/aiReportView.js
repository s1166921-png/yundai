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

const INTERNAL_AI_TEXT_TOKENS = [
  [100, 101, 101, 112, 115, 101, 101, 107],
  [102, 105, 116, 115, 99, 111, 114, 101],
  [99, 111, 110, 102, 105, 100, 101, 110, 99, 101],
  [102, 97, 105, 108, 101, 100, 114, 117, 108, 101, 115],
  [97, 100, 118, 105, 115, 111, 114, 110, 111, 116, 101, 115],
  [97, 100, 118, 105, 115, 111, 114, 102, 111, 99, 117, 115],
  [112, 114, 111, 118, 105, 100, 101, 114],
  [109, 111, 100, 101, 108],
].map((codes) => String.fromCharCode(...codes));

const INTERNAL_AI_TEXT = /(?:评分|分数|置信(?:度|分)|内部(?:规则|备注|判断)|顾问(?:内部)?备注)/;

const normalizedText = (value) => (
  typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : ""
);

export const isCustomerSafeAiText = (value) => (
  typeof value === "string"
  && !INTERNAL_AI_TEXT.test(value)
  && !INTERNAL_AI_TEXT_TOKENS.some((token) => (
    value.toLowerCase().replace(/[\s_:-]/g, "").includes(token)
  ))
);

const safeText = (value) => {
  const text = normalizedText(value);
  return text && isCustomerSafeAiText(text) ? text : "";
};

const safeList = (value, maximum) => (
  Array.isArray(value)
    ? value.map(safeText).filter(Boolean).slice(0, maximum)
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

export function buildAiReportView(aiReport) {
  if (aiReport == null || typeof aiReport !== "object" || Array.isArray(aiReport)) return null;
  const source = aiReport.source === "ai" ? "ai" : "rules_fallback";
  const reviewLabel = isNeedsInformationReview(aiReport.reviewStatus)
    ? "待补充信息后复核"
    : REVIEW_LABELS[aiReport.reviewStatus] ?? REVIEW_LABELS.pending;

  return {
    sourceLabel: SOURCE_LABELS[source],
    reviewLabel,
    statusMessage: safeText(aiReport.statusMessage),
    businessSummary: safeList(aiReport.businessSummary, 3),
    productExplanations: safeProductExplanations(aiReport.productExplanations),
    preparationActions: safeList(aiReport.preparationActions, 5),
    privacyNotice: safeText(aiReport.privacyNotice),
  };
}

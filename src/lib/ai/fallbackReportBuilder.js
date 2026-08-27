import {
  AI_PROMPT_VERSION,
  FALLBACK_STATUS_MESSAGE,
} from "./aiReportContract.js";

const copyStrings = (value, maximum) => (
  Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim().length > 0).slice(0, maximum)
    : []
);

export function buildFallbackAiAnalysis({ matchReport, errorCategory, now = () => new Date() } = {}) {
  const report = matchReport ?? {};
  const rankedProducts = [report.primary, ...(Array.isArray(report.alternatives) ? report.alternatives : [])]
    .filter((product) => typeof product?.productId === "string");
  const missingDocuments = copyStrings(report.missingDocuments, 5);

  return {
    status: "fallback",
    customerReport: {
      statusMessage: FALLBACK_STATUS_MESSAGE,
      businessSummary: typeof report.summary === "string" && report.summary.trim().length > 0
        ? [report.summary]
        : [],
      productExplanations: rankedProducts.map((product) => ({
        productId: product.productId,
        reasons: copyStrings(product.whyMatched, 3),
        itemsToConfirm: [],
      })),
      preparationActions: missingDocuments,
    },
    advisorFocus: [],
    meta: {
      provider: "local",
      model: null,
      promptVersion: AI_PROMPT_VERSION,
      errorCategory,
      generatedAt: now().toISOString(),
    },
  };
}

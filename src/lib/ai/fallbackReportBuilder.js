import {
  AI_NARRATIVE_SCHEMA_VERSION,
  AI_PROMPT_VERSION,
  buildDeterministicAiNarrative,
} from "./aiReportContract.js";

export function buildFallbackAiAnalysis({
  analysisInput,
  errorCategory,
  now = () => new Date(),
  providerAttempted = false,
} = {}) {
  const narrative = buildDeterministicAiNarrative(analysisInput);
  return {
    status: "fallback",
    customerReport: {
      schemaVersion: AI_NARRATIVE_SCHEMA_VERSION,
      portfolioSummaryCodes: narrative.portfolioSummaryCodes,
      productAnalyses: narrative.productAnalyses,
      preparationActionCodes: narrative.preparationActionCodes,
    },
    advisorFocusCodes: [],
    advisorFocus: [],
    meta: {
      provider: "local",
      model: null,
      promptVersion: AI_PROMPT_VERSION,
      errorCategory,
      generatedAt: now().toISOString(),
      providerAttempted: providerAttempted === true,
    },
  };
}

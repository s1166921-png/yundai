import {
  AI_NARRATIVE_SCHEMA_VERSION,
  AI_PROMPT_VERSION,
} from "./aiReportContract.js";

const safeInput = (analysisInput) => {
  if (
    analysisInput != null
    && typeof analysisInput === "object"
    && !Array.isArray(analysisInput)
    && Array.isArray(analysisInput.summaryCodes)
    && Array.isArray(analysisInput.products)
    && Array.isArray(analysisInput.preparationActionCodes)
  ) return analysisInput;
  return {
    summaryCodes: ["summary:profile-submitted"],
    products: [],
    preparationActionCodes: ["action:prepare-verifiable-business-materials"],
  };
};

export function buildFallbackAiAnalysis({
  analysisInput,
  errorCategory,
  now = () => new Date(),
  providerAttempted = false,
} = {}) {
  const input = safeInput(analysisInput);
  return {
    status: "fallback",
    customerReport: {
      schemaVersion: AI_NARRATIVE_SCHEMA_VERSION,
      businessSummaryCodes: input.summaryCodes.slice(0, 3),
      productExplanations: input.products.map((product) => ({
        productId: product.productId,
        reasonCodes: Array.isArray(product.reasonCodes) ? product.reasonCodes.slice(0, 3) : [],
        confirmationCodes: Array.isArray(product.confirmationCodes) ? product.confirmationCodes.slice(0, 3) : [],
      })),
      preparationActionCodes: input.preparationActionCodes.slice(0, 5),
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

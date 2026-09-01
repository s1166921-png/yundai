import { estimateAmount } from "./amountEstimators.js";
import { getProductById } from "./productCatalog.js";
import { ruleDependencyFields } from "./ruleEvaluator.js";

export const SCENARIO_POLICY_VERSION = "meiou-financing-scenarios-v1";

const TERM_CODES = Object.freeze({
  "webank-cross-border-data-loan": ["webank_4_plus_5", "webank_3_plus_6"],
  "pingan-foreign-trade-logistics-loan": ["up_to_36_months"],
  "linklogis-amazon-sc": ["sc_90_days", "sc_revolving"],
  "linklogis-amazon-vc": ["up_to_120_days"],
  "linklogis-b2b-factoring": ["up_to_120_days"],
});

const ALLOWED_ELIGIBILITY_STATUSES = new Set(["eligible", "needs_information"]);
const FORMULA_UNAVAILABLE_PRODUCT_IDS = new Set([
  "cmb-guangdong-business-loan",
  "pingan-orange-tax-loan",
  "linklogis-amazon-vc",
  "linklogis-b2b-factoring",
]);
const MAX_MISSING_EVIDENCE_CODES = 20;
const MAX_MISSING_EVIDENCE_CODE_LENGTH = 128;

const freeze = (value) => {
  if (value === null || typeof value !== "object") return value;
  for (const nestedValue of Object.values(value)) freeze(nestedValue);
  return Object.freeze(value);
};

const clone = (value) => {
  if (Array.isArray(value)) return value.map(clone);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, clone(nestedValue)]));
  }
  return value;
};

const sameCurrencyAmount = (profile, currency) => {
  const amount = profile?.requestedAmount;
  return amount?.currency === currency && Number.isFinite(amount.amount)
    ? amount.amount
    : null;
};

const range = (scenarioCode, currency, minimum, maximum, assumptionCodes) => {
  const roundedMinimum = Math.round(minimum);
  const roundedMaximum = Math.round(maximum);

  if (!Number.isFinite(roundedMinimum) || !Number.isFinite(roundedMaximum)
    || roundedMaximum <= 0 || roundedMinimum > roundedMaximum) {
    return null;
  }

  return freeze({
    scenarioCode,
    currency,
    minimum: roundedMinimum,
    maximum: roundedMaximum,
    assumptionCodes: [...assumptionCodes],
  });
};

const usableRanges = (ranges) => ranges.filter((item) => item !== null);

const moneyEvidenceCode = (profile, field, currency, code) => (
  profile?.[field]?.currency === currency && Number.isFinite(profile[field].amount)
    ? []
    : [code]
);

const requestedAmountEvidenceCode = (profile, currency) => (
  sameCurrencyAmount(profile, currency) === null ? ["requested-amount"] : []
);

const collectionsEvidenceCode = (profile) => {
  const collections = profile?.collectionsLast12Months;
  const legacyCollections = profile?.allStoreRepayments;
  const hasCollections = [collections, legacyCollections].some((amount) => (
    amount?.currency === "RMB" && Number.isFinite(amount.amount)
  ));
  return hasCollections ? [] : ["twelve-month-collections"];
};

const amountEvidenceCodes = (productId, profile, amountEstimate) => {
  switch (productId) {
    case "webank-cross-border-data-loan":
      return [...collectionsEvidenceCode(profile), ...requestedAmountEvidenceCode(profile, "RMB")];
    case "linklogis-amazon-sc":
      return [
        ...(Number.isFinite(profile?.qualifiedStoreCount) && profile.qualifiedStoreCount > 0
          ? []
          : ["qualified-store-count"]),
        ...requestedAmountEvidenceCode(profile, "USD"),
      ];
    case "pingan-foreign-trade-logistics-loan":
      return amountEstimate.kind === "exact"
        ? []
        : [
          ...moneyEvidenceCode(profile, "annualRevenue", "RMB", "annual-revenue"),
          ...moneyEvidenceCode(profile, "taxInvoiceAmount", "RMB", "tax-invoice-amount"),
          ...(profile?.industry == null ? ["industry"] : []),
        ];
    default:
      return [];
  }
};

const matcherEvidenceCodes = (product) => new Set(product.ruleSet.flatMap(ruleDependencyFields));

const sanitizedMatcherEvidenceCodes = (missingFields, product) => {
  if (!Array.isArray(missingFields)) return [];

  const allowedCodes = matcherEvidenceCodes(product);
  return [...new Set(missingFields.filter((code) => (
    typeof code === "string"
    && code.length > 0
    && code.length <= MAX_MISSING_EVIDENCE_CODE_LENGTH
    && allowedCodes.has(code)
  )))].slice(0, MAX_MISSING_EVIDENCE_CODES);
};

const boundedEvidenceCodes = (codes) => [...new Set(codes.filter((code) => (
  typeof code === "string"
  && code.length > 0
  && code.length <= MAX_MISSING_EVIDENCE_CODE_LENGTH
)))].slice(0, MAX_MISSING_EVIDENCE_CODES);

const webankScenarios = (amountEstimate, profile) => {
  const requestedAmount = sameCurrencyAmount(profile, "RMB");
  if (amountEstimate.kind !== "range" || requestedAmount === null) return [];

  const cap = Math.min(20000000, requestedAmount);
  const monthlyCollections = amountEstimate.min;
  return usableRanges([
    range("conservative", "RMB", Math.min(monthlyCollections, cap), Math.min(monthlyCollections * 1.5, cap), ["monthly-collections", "requested-amount-cap"]),
    range("balanced", "RMB", Math.min(monthlyCollections * 1.5, cap), Math.min(monthlyCollections * 2.5, cap), ["monthly-collections", "requested-amount-cap"]),
    range("growth", "RMB", Math.min(monthlyCollections * 2.5, cap), Math.min(monthlyCollections * 3.5, cap), ["monthly-collections", "requested-amount-cap"]),
  ]);
};

const linklogisScScenarios = (amountEstimate, profile) => {
  const requestedAmount = sameCurrencyAmount(profile, "USD");
  if (amountEstimate.kind !== "range" || requestedAmount === null) return [];

  const cap = Math.min(amountEstimate.max, requestedAmount);
  return usableRanges([
    range("conservative", "USD", cap * 0.4, cap * 0.6, ["qualified-store-cap", "meiou-v1-simulation"]),
    range("balanced", "USD", cap * 0.6, cap * 0.8, ["qualified-store-cap", "meiou-v1-simulation"]),
    range("growth", "USD", cap * 0.8, cap, ["qualified-store-cap", "meiou-v1-simulation"]),
  ]);
};

const amountScenariosFor = (productId, amountEstimate, profile) => {
  switch (productId) {
    case "webank-cross-border-data-loan":
      return webankScenarios(amountEstimate, profile);
    case "linklogis-amazon-sc":
      return linklogisScScenarios(amountEstimate, profile);
    case "pingan-foreign-trade-logistics-loan":
      return amountEstimate.kind === "exact"
        ? usableRanges([range("balanced", amountEstimate.currency, amountEstimate.min, amountEstimate.max, ["verified-logistics-formula"])])
        : [];
    default:
      return [];
  }
};

const buildProductScenarios = (match, profile) => {
  const product = getProductById(match.productId);
  const amountEstimate = estimateAmount(product, profile);
  const allAmountScenarios = amountScenariosFor(product.id, amountEstimate, profile);
  const missingEvidenceCodes = boundedEvidenceCodes([
    ...sanitizedMatcherEvidenceCodes(match.missingFields, product),
    ...amountEvidenceCodes(product.id, profile, amountEstimate),
  ]);
  const amountScenarios = match.status === "eligible" && missingEvidenceCodes.length === 0
    ? allAmountScenarios
    : allAmountScenarios.filter(({ scenarioCode }) => scenarioCode === "conservative");

  return freeze({
    productId: product.id,
    rank: match.rank,
    eligibilityStatus: match.status,
    quantificationStatus: FORMULA_UNAVAILABLE_PRODUCT_IDS.has(product.id)
      ? "formula_unavailable"
      : amountScenarios.length > 0 ? "quantified" : "needs_evidence",
    amountScenarios,
    termOptions: [...(TERM_CODES[product.id] ?? [])],
    pricingReference: clone(product.pricing),
    missingEvidenceCodes,
  });
};

export function buildFinancingScenarioInput({ profile = {}, productMatches = [] } = {}) {
  const seenRanks = new Set();
  const seenProductIds = new Set();
  const matches = Array.isArray(productMatches) ? productMatches : [];
  const products = matches
    .filter((match) => (
      match !== null
      && typeof match === "object"
      && !Array.isArray(match)
    ))
    .filter(({ productId, rank, status }) => (
      getProductById(productId) != null
      && Number.isInteger(rank)
      && rank >= 1
      && rank <= 3
      && ALLOWED_ELIGIBILITY_STATUSES.has(status)
    ))
    .sort((left, right) => left.rank - right.rank || left.productId.localeCompare(right.productId))
    .filter(({ productId, rank }) => {
      if (seenRanks.has(rank) || seenProductIds.has(productId)) return false;
      seenRanks.add(rank);
      seenProductIds.add(productId);
      return true;
    })
    .slice(0, 3)
    .map((match) => buildProductScenarios(match, profile));

  return freeze({ policyVersion: SCENARIO_POLICY_VERSION, products });
}

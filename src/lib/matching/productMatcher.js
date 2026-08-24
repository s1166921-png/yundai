import { estimateAmount } from "./amountEstimators.js";
import { PRODUCT_CATALOG } from "./productCatalog.js";
import { evaluateEligibility } from "./ruleEvaluator.js";

const FIT_DIMENSIONS = Object.freeze([
  "businessModel",
  "scaleAndLimit",
  "cashFlow",
  "currencyTermUse",
  "controlAcceptance",
  "documentation",
]);
const NEUTRAL_SCORE = 50;

const STATUS_ORDER = Object.freeze({
  eligible: 0,
  needs_information: 1,
  ineligible: 2,
});

const readPath = (value, path) => path.split(".").reduce((current, key) => current?.[key], value);
const isAnswered = (value) => value != null && value !== "" && (!Array.isArray(value) || value.length > 0);
const average = (scores) => scores.length === 0
  ? NEUTRAL_SCORE
  : scores.reduce((total, score) => total + score, 0) / scores.length;
const bounded = (score) => Math.max(0, Math.min(100, Math.round(score)));

const confidenceFor = (product, eligibility) => {
  if (product.ruleSet.length === 0) return 100;
  const answeredRuleCount = eligibility.passedRules.length + eligibility.failedRules.length;
  return bounded((answeredRuleCount / product.ruleSet.length) * 100);
};

const statusByRuleId = (eligibility) => new Map([
  ...eligibility.passedRules.map((rule) => [rule.id, "passed"]),
  ...eligibility.failedRules.map((rule) => [rule.id, "failed"]),
]);

const scoreRule = (status) => status === "passed" ? 100 : 0;

const businessModelScore = (product, profile) => {
  const acceptedModels = product.fitProfile.businessModels;
  if (acceptedModels.length === 0) return NEUTRAL_SCORE;
  if (!Array.isArray(profile.businessModels) || profile.businessModels.length === 0) return 0;
  return profile.businessModels.some((model) => acceptedModels.includes(model)) ? 100 : 0;
};

const requestedLimitScore = (product, profile) => {
  const { limit = {} } = product;
  const hasMinimum = Number.isFinite(limit.minimum);
  const hasMaximum = Number.isFinite(limit.maximum) || Number.isFinite(limit.maximumPerStore);
  if (!hasMinimum && !hasMaximum) return null;

  const request = profile.requestedAmount;
  if (!Number.isFinite(request?.amount) || request.amount < 0 || request.currency !== product.currency) return 0;

  const storeCount = Number.isFinite(profile.qualifiedStoreCount) && profile.qualifiedStoreCount > 0
    ? profile.qualifiedStoreCount
    : 1;
  const maximum = Number.isFinite(limit.maximum)
    ? limit.maximum
    : Number.isFinite(limit.maximumPerStore) ? limit.maximumPerStore * storeCount : null;
  if (hasMinimum && request.amount < limit.minimum) return 0;
  if (maximum != null && request.amount > maximum) return 0;
  return 100;
};

const scaleAndLimitScore = (product, profile, eligibility) => {
  const statuses = statusByRuleId(eligibility);
  const scores = product.fitProfile.scaleRuleIds.map((ruleId) => scoreRule(statuses.get(ruleId)));
  const limitScore = requestedLimitScore(product, profile);
  if (limitScore != null) scores.push(limitScore);
  return average(scores);
};

const repaymentScore = (product, profile) => {
  const methods = product.fitProfile.repaymentMethods;
  if (methods.length === 0) return null;
  if (!isAnswered(profile.preferredRepaymentMethod)) return 0;
  return methods.includes(profile.preferredRepaymentMethod) ? 100 : 0;
};

const cashFlowScore = (product, profile) => {
  const scores = product.fitProfile.cashFlowFields.map((field) => (
    isAnswered(readPath(profile, field)) ? 100 : 0
  ));
  const repayment = repaymentScore(product, profile);
  if (repayment != null) scores.push(repayment);
  return average(scores);
};

const maximumTermMonths = (product) => {
  const term = product.term ?? {};
  if (Number.isFinite(term.maximumMonths)) return term.maximumMonths;
  if (Number.isFinite(term.creditMaximumMonths)) return term.creditMaximumMonths;
  if (Number.isFinite(term.maximumDays)) return term.maximumDays / 30;
  if (Number.isFinite(term.financingDays)) return term.financingDays / 30;
  return null;
};

const requestedCurrency = (profile) => {
  if (typeof profile.requestedAmount?.currency === "string") return profile.requestedAmount.currency.toUpperCase();
  if (typeof profile.preferredCurrency === "string") return profile.preferredCurrency.toUpperCase();
  return null;
};

const currencyTermUseScore = (product, profile) => {
  const currency = requestedCurrency(profile);
  const scores = [currency == null ? 0 : currency === product.currency ? 100 : 0];
  const maximumMonths = maximumTermMonths(product);
  if (maximumMonths != null) {
    scores.push(Number.isFinite(profile.preferredTermMonths)
      ? profile.preferredTermMonths <= maximumMonths ? 100 : 0
      : 0);
  }
  if (product.fitProfile.purposes.length > 0) {
    scores.push(product.fitProfile.purposes.includes(profile.fundUse) ? 100 : 0);
  }
  return average(scores);
};

const controlGroupScore = (group, profile) => {
  const fields = group.allOf ?? group.anyOf ?? [];
  const values = fields.map((field) => readPath(profile, field));
  if (group.anyOf) return values.some((value) => value === true) ? 100 : 0;
  return values.length > 0 && values.every((value) => value === true) ? 100 : 0;
};

const controlAcceptanceScore = (product, profile) => average(
  product.fitProfile.controlGroups.map((group) => controlGroupScore(group, profile)),
);

const fitDimensionsFor = (product, profile, eligibility, confidence) => ({
  businessModel: bounded(businessModelScore(product, profile)),
  scaleAndLimit: bounded(scaleAndLimitScore(product, profile, eligibility)),
  cashFlow: bounded(cashFlowScore(product, profile)),
  currencyTermUse: bounded(currencyTermUseScore(product, profile)),
  controlAcceptance: bounded(controlAcceptanceScore(product, profile)),
  documentation: bounded(confidence),
});

const fitScoreFor = (product, fitDimensions) => {
  const totalWeight = FIT_DIMENSIONS.reduce((sum, dimension) => sum + product.fitWeights[dimension], 0);
  return bounded(FIT_DIMENSIONS.reduce(
    (sum, dimension) => sum + fitDimensions[dimension] * product.fitWeights[dimension],
    0,
  ) / totalWeight);
};

const cloneSelected = (profile, fields) => Object.fromEntries(fields
  .filter((field) => profile?.[field] !== undefined)
  .map((field) => [field, structuredClone(profile[field])]));

const estimatorInputSnapshot = (productId, profile) => {
  switch (productId) {
    case "pingan-foreign-trade-logistics-loan":
      return cloneSelected(profile, ["annualRevenue", "industry", "taxInvoiceAmount"]);
    case "webank-cross-border-data-loan":
      return cloneSelected(profile, profile?.collectionsLast12Months == null
        ? ["allStoreRepayments"]
        : ["collectionsLast12Months"]);
    case "linklogis-amazon-sc":
      return cloneSelected(profile, ["qualifiedStoreCount"]);
    case "linklogis-amazon-vc":
    case "linklogis-b2b-factoring":
      return cloneSelected(profile, ["accountsReceivableBalance"]);
    default:
      return {};
  }
};

export function matchProducts(profile = {}) {
  const matches = PRODUCT_CATALOG
    .map((product, catalogOrder) => ({ product, catalogOrder }))
    .filter(({ product }) => product.enabled)
    .map(({ product, catalogOrder }) => {
      const eligibility = evaluateEligibility(product, profile);
      const confidence = confidenceFor(product, eligibility);
      const fitDimensions = fitDimensionsFor(product, profile, eligibility, confidence);

      return {
        productId: product.id,
        status: eligibility.status,
        rank: null,
        fitScore: fitScoreFor(product, fitDimensions),
        fitDimensions,
        confidence,
        passedRules: eligibility.passedRules,
        failedRules: eligibility.failedRules,
        missingFields: eligibility.missingFields,
        estimatedAmount: estimateAmount(product, profile),
        inputSnapshot: estimatorInputSnapshot(product.id, profile),
        ruleVersion: product.version,
        catalogOrder,
      };
    })
    .sort((left, right) => (
      STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
      || right.fitScore - left.fitScore
      || right.confidence - left.confidence
      || left.catalogOrder - right.catalogOrder
    ));

  let rank = 1;
  for (const match of matches) {
    if (match.status !== "ineligible" && rank <= 3) {
      match.rank = rank;
      rank += 1;
    }
    delete match.catalogOrder;
  }

  return matches;
}

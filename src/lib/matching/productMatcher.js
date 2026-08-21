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

const STATUS_ORDER = Object.freeze({
  eligible: 0,
  needs_information: 1,
  ineligible: 2,
});

const BUSINESS_MODEL_FIELDS = new Set([
  "entityRegion",
  "entityType",
  "registeredProvince",
  "industry",
  "businessModels",
  "primaryPlatformOrBuyerName",
  "platformSites",
  "selfOperatedImportExport",
  "hasImportExportLicense",
  "foreignExchangeClassification",
  "customsCreditClassification",
  "buyerName",
  "buyerCountry",
  "buyerPlatformType",
]);

const SCALE_AND_LIMIT_FIELDS = new Set([
  "companyAgeMonths",
  "controllerIndustryExperienceYears",
  "platformHistoryMonths",
  "storeCount",
  "singleStoreGmv",
  "allStoreSales",
  "importExportAmountLast12Months",
  "importExportAmountMonths13To24",
  "importExportCountLast12Months",
  "annualRevenue",
  "annualB2bTrade",
  "buyerTradingHistoryMonths",
]);

const CASH_FLOW_FIELDS = new Set([
  "singleStoreGmv",
  "allStoreSales",
  "allStoreRepayments",
  "annualRevenue",
  "annualB2bTrade",
  "accountsReceivableBalance",
  "taxInvoiceAmount",
  "refundRatePercent",
  "fbaInventoryTurnoverCount",
  "averageMonthlyFbaInventoryValue",
  "assetLiabilityRatioPercent",
  "coreAssetLiabilityRatioPercent",
  "creditBankCount",
  "hasCurrentOverdue",
  "hasMajorLitigation",
  "hasDishonestyRecord",
  "hasAbnormalOperations",
]);

const CONTROL_ACCEPTANCE_FIELDS = new Set([
  "acceptsAccountControl",
  "acceptsNoa",
  "acceptsReceivablesAssignment",
]);

const rootField = (field) => field.split(".")[0];

const fitDimensionsForRule = (rule) => {
  const field = rootField(rule.field);
  const dimensions = [];
  if (BUSINESS_MODEL_FIELDS.has(field)) dimensions.push("businessModel");
  if (SCALE_AND_LIMIT_FIELDS.has(field)) dimensions.push("scaleAndLimit");
  if (CASH_FLOW_FIELDS.has(field)) dimensions.push("cashFlow");
  if (CONTROL_ACCEPTANCE_FIELDS.has(field)) dimensions.push("controlAcceptance");
  return dimensions.length > 0 ? dimensions : ["documentation"];
};

const confidenceFor = (product, eligibility) => {
  if (product.ruleSet.length === 0) return 100;
  const answeredRuleCount = eligibility.passedRules.length + eligibility.failedRules.length;
  return Math.round((answeredRuleCount / product.ruleSet.length) * 100);
};

const statusByRuleId = (eligibility) => new Map([
  ...eligibility.passedRules.map((rule) => [rule.id, "passed"]),
  ...eligibility.failedRules.map((rule) => [rule.id, "failed"]),
]);

const ruleCoverageScore = (rules, statuses) => {
  if (rules.length === 0) return 0;
  const passed = rules.filter((rule) => statuses.get(rule.id) === "passed").length;
  return (passed / rules.length) * 100;
};

const maximumTermMonths = (product) => {
  const term = product.term ?? {};
  if (Number.isFinite(term.maximumMonths)) return term.maximumMonths;
  if (Number.isFinite(term.creditMaximumMonths)) return term.creditMaximumMonths;
  if (Number.isFinite(term.maximumDays)) return term.maximumDays / 30;
  if (Number.isFinite(term.financingDays)) return term.financingDays / 30;
  return null;
};

const currencyTermUseScore = (product, profile) => {
  const preferredCurrency = typeof profile?.preferredCurrency === "string"
    ? profile.preferredCurrency.toUpperCase()
    : null;
  const currencyScore = preferredCurrency == null
    ? 0
    : preferredCurrency === product.currency ? 100 : 0;
  const requestedMonths = profile?.preferredTermMonths;
  const maximumMonths = maximumTermMonths(product);
  const termScore = Number.isFinite(requestedMonths) && requestedMonths >= 0 && maximumMonths != null
    ? requestedMonths <= maximumMonths ? 100 : 0
    : 0;

  return (currencyScore + termScore) / 2;
};

const fitScoreFor = (product, profile, eligibility, confidence) => {
  const statuses = statusByRuleId(eligibility);
  const rulesByDimension = Object.fromEntries(FIT_DIMENSIONS.map((dimension) => [dimension, []]));

  for (const rule of product.ruleSet) {
    for (const dimension of fitDimensionsForRule(rule)) {
      rulesByDimension[dimension].push(rule);
    }
  }

  const dimensionScores = {
    businessModel: ruleCoverageScore(rulesByDimension.businessModel, statuses),
    scaleAndLimit: ruleCoverageScore(rulesByDimension.scaleAndLimit, statuses),
    cashFlow: ruleCoverageScore(rulesByDimension.cashFlow, statuses),
    currencyTermUse: currencyTermUseScore(product, profile),
    controlAcceptance: ruleCoverageScore(rulesByDimension.controlAcceptance, statuses),
    documentation: confidence,
  };
  const weightedScore = FIT_DIMENSIONS.reduce(
    (score, dimension) => score + dimensionScores[dimension] * product.fitWeights[dimension],
    0,
  ) / FIT_DIMENSIONS.reduce((weight, dimension) => weight + product.fitWeights[dimension], 0);

  return Math.max(0, Math.min(100, Math.round(weightedScore)));
};

const snapshotProfile = (profile) => structuredClone(profile ?? {});

export function matchProducts(profile = {}) {
  const matches = PRODUCT_CATALOG
    .map((product, catalogOrder) => ({ product, catalogOrder }))
    .filter(({ product }) => product.enabled)
    .map(({ product, catalogOrder }) => {
      const eligibility = evaluateEligibility(product, profile);
      const confidence = confidenceFor(product, eligibility);

      return {
        productId: product.id,
        status: eligibility.status,
        rank: null,
        fitScore: fitScoreFor(product, profile, eligibility, confidence),
        confidence,
        passedRules: eligibility.passedRules,
        failedRules: eligibility.failedRules,
        missingFields: eligibility.missingFields,
        estimatedAmount: estimateAmount(product, profile),
        inputSnapshot: snapshotProfile(profile),
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

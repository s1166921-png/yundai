import { PRODUCT_IDS } from "../matching/productCatalog.js";
import {
  buildAdvisorFocusCodes,
  buildPreparationActionCodes,
  buildProductReferenceCodes,
  buildSummaryCodes,
} from "./aiReportReferences.js";
import { buildFinancingScenarioInput } from "../matching/financingScenarioEngine.js";
import { buildRiskCodes, buildSensitivityCodes } from "./loanAnalystReferences.js";

export const AI_ANALYSIS_SCHEMA_VERSION = "meiou-analysis-v3";

const PRIMARY_BUSINESS_MODELS = new Set([
  "tax_operations",
  "amazon_sc",
  "amazon_vc",
  "platform_ecommerce",
  "b2b_supermarket",
  "general_import_export",
  "processing_manufacturing",
  "wholesale_retail",
  "other",
]);

const ENTITY_REGIONS = new Set(["mainland", "hong_kong", "united_states", "other_overseas"]);
const FUND_USES = new Set([
  "inventory_procurement",
  "logistics_working_capital",
  "receivables_turnover",
  "platform_operations",
  "tax_business_operations",
  "other",
]);
const PRODUCT_STATUSES = new Set(["eligible", "needs_information"]);
const PRODUCT_ID_SET = new Set(PRODUCT_IDS);

const monthBand = (value) => {
  if (!Number.isFinite(value) || value < 0) return null;
  if (value < 6) return "under_6_months";
  if (value < 12) return "6-12_months";
  if (value < 24) return "12-24_months";
  if (value < 60) return "24-60_months";
  return "60_plus_months";
};

const moneyBand = (money) => {
  if (!Number.isFinite(money?.amount) || money.amount < 0 || !["RMB", "USD"].includes(money.currency)) return null;
  const bands = money.currency === "USD" ? [
    [500000, "under_500k_USD"], [1000000, "500k-1m_USD"],
    [3000000, "1m-3m_USD"], [5000000, "3m-5m_USD"],
    [10000000, "5m-10m_USD"], [Infinity, "10m_plus_USD"],
  ] : [
    [1000000, "under_1m_RMB"], [3000000, "1m-3m_RMB"],
    [5000000, "3m-5m_RMB"], [10000000, "5m-10m_RMB"],
    [30000000, "10m-30m_RMB"], [50000000, "30m-50m_RMB"],
    [100000000, "50m-100m_RMB"], [Infinity, "100m_plus_RMB"],
  ];
  return bands.find(([upper]) => money.amount < upper)?.[1] ?? null;
};

const addEnumFact = (facts, key, value, allowedValues) => {
  if (allowedValues.has(value)) facts[key] = value;
};

const addBucketFact = (facts, key, value, bucket) => {
  const mapped = bucket(value);
  if (mapped != null) facts[key] = mapped;
};

const rankedProducts = (productMatches) => {
  const candidates = (Array.isArray(productMatches) ? productMatches : [])
    .filter((match) => (
      match != null
      && typeof match === "object"
      && !Array.isArray(match)
      && Object.hasOwn(match, "productId")
      && Object.hasOwn(match, "rank")
      && Object.hasOwn(match, "status")
      && PRODUCT_ID_SET.has(match.productId)
      && Number.isInteger(match.rank)
      && match.rank >= 1
      && match.rank <= 3
      && PRODUCT_STATUSES.has(match.status)
    ));
  const rankCounts = new Map();
  const productCounts = new Map();
  for (const match of candidates) {
    rankCounts.set(match.rank, (rankCounts.get(match.rank) ?? 0) + 1);
    productCounts.set(match.productId, (productCounts.get(match.productId) ?? 0) + 1);
  }

  return candidates
    .filter((match) => rankCounts.get(match.rank) === 1 && productCounts.get(match.productId) === 1)
    .sort((left, right) => left.rank - right.rank)
    .map((match) => ({
      productId: match.productId,
      ...buildProductReferenceCodes(match.productId, match.passedRules, match.unknownRules),
    }));
};

export const buildAiAnalysisInput = ({ profile = {}, productMatches = [], matchReport = {} } = {}) => {
  const facts = {};
  addEnumFact(facts, "entityRegion", profile.entityRegion, ENTITY_REGIONS);
  addBucketFact(facts, "companyAgeBand", profile.companyAgeMonths, monthBand);
  addBucketFact(facts, "platformHistoryBand", profile.platformHistoryMonths, monthBand);
  addBucketFact(facts, "singleStoreGmvBand", profile.singleStoreGmv, moneyBand);
  addBucketFact(facts, "requestedAmountBand", profile.requestedAmount, moneyBand);
  addBucketFact(facts, "annualRevenueBand", profile.annualRevenue, moneyBand);
  addBucketFact(facts, "collectionsLast12MonthsBand", profile.collectionsLast12Months, moneyBand);
  addBucketFact(facts, "taxInvoiceAmountBand", profile.taxInvoiceAmount, moneyBand);
  addBucketFact(facts, "currentLoanBalanceBand", profile.currentLoanBalance, moneyBand);
  addEnumFact(facts, "fundUse", profile.fundUse, FUND_USES);
  if (profile.acceptsAccountControl === true || profile.acceptsAccountControl === false) {
    facts.acceptsAccountControl = profile.acceptsAccountControl;
  }

  const safeProductMatches = Array.isArray(productMatches) ? productMatches : [];
  const financing = buildFinancingScenarioInput({ profile, productMatches: safeProductMatches });
  const scenarioByProduct = new Map(financing.products.map((item) => [item.productId, item]));
  const products = rankedProducts(safeProductMatches).map((product) => {
    const scenario = scenarioByProduct.get(product.productId);
    const amountScenarios = scenario?.amountScenarios ?? [];
    return {
      ...product,
      quantificationStatus: scenario?.quantificationStatus ?? "needs_evidence",
      amountScenarios,
      amountScenarioCodes: amountScenarios.map(({ scenarioCode }) => scenarioCode),
      termCodes: scenario?.termOptions ?? [],
      riskCodes: buildRiskCodes({ profile, productId: product.productId }),
      sensitivityCodes: buildSensitivityCodes({ profile, productId: product.productId }),
      confidenceCodes: ["low", "medium", "high"],
    };
  });
  return {
    schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
    policyVersion: financing.policyVersion,
    scenario: PRIMARY_BUSINESS_MODELS.has(profile.primaryBusinessModel) ? profile.primaryBusinessModel : null,
    facts,
    summaryCodes: buildSummaryCodes({
      scenario: PRIMARY_BUSINESS_MODELS.has(profile.primaryBusinessModel) ? profile.primaryBusinessModel : null,
      facts,
    }),
    products,
    preparationActionCodes: buildPreparationActionCodes(matchReport),
    advisorFocusCodes: buildAdvisorFocusCodes(products),
  };
};

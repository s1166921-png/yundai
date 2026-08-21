import { MATCH_DISCLAIMER } from "./reportBuilder.js";

const SCENARIOS = Object.freeze([
  Object.freeze({
    id: "tax-operations",
    label: "税务与经营周转",
    productIds: Object.freeze(["cmb-guangdong-business-loan", "pingan-orange-tax-loan"]),
  }),
  Object.freeze({
    id: "foreign-trade",
    label: "外贸经营",
    productIds: Object.freeze(["pingan-foreign-trade-logistics-loan"]),
  }),
  Object.freeze({
    id: "amazon-marketplace",
    label: "Amazon 平台",
    productIds: Object.freeze([
      "webank-cross-border-data-loan",
      "linklogis-amazon-sc",
      "linklogis-amazon-vc",
    ]),
  }),
  Object.freeze({
    id: "b2b-receivables",
    label: "B2B 应收账款",
    productIds: Object.freeze(["linklogis-b2b-factoring"]),
  }),
]);

const TARGET_RULE_IDS = Object.freeze({
  "cmb-guangdong-business-loan": Object.freeze(["registered-in-guangdong", "annual-revenue-minimum"]),
  "pingan-orange-tax-loan": Object.freeze(["eligible-applicant-role", "company-registration-two-years"]),
  "pingan-foreign-trade-logistics-loan": Object.freeze(["eligible-industry", "self-operated-import-export"]),
  "webank-cross-border-data-loan": Object.freeze(["amazon-collection-entity", "amazon-us-only"]),
  "linklogis-amazon-sc": Object.freeze(["amazon-store", "single-store-annual-gmv"]),
  "linklogis-amazon-vc": Object.freeze(["amazon-vc-entity", "amazon-vc-us-site"]),
  "linklogis-b2b-factoring": Object.freeze(["buyer-trading-history", "annual-trading-volume"]),
});

const currencyUnit = (currency) => ({ RMB: "元", USD: "美元" }[currency] ?? currency ?? "");

const formatAmountValue = (value) => {
  if (!Number.isFinite(value)) return null;
  if (value >= 10000 && value % 10000 === 0) return `${value / 10000}万`;
  return Number(value).toLocaleString("zh-CN");
};

const formatLimit = (limit = {}) => {
  const unit = currencyUnit(limit.currency);
  if (Number.isFinite(limit.maximumPerStore)) {
    return `单店最高${formatAmountValue(limit.maximumPerStore)}${unit}${limit.revolving ? "，可循环" : ""}`;
  }
  if (Number.isFinite(limit.minimum) && Number.isFinite(limit.maximum)) {
    return `${formatAmountValue(limit.minimum)}-${formatAmountValue(limit.maximum)}${unit}${limit.revolving ? "，可循环" : ""}`;
  }
  if (Number.isFinite(limit.maximum)) {
    return `最高${formatAmountValue(limit.maximum)}${unit}${limit.revolving ? "，可循环" : ""}`;
  }
  return limit.note ?? "目录暂未提供";
};

const formatTerm = (term = {}) => {
  if (Number.isFinite(term.financingDays)) {
    return term.repayment ? `${term.financingDays}天或${term.repayment}` : `${term.financingDays}天`;
  }
  if (Number.isFinite(term.maximumDays)) {
    return `最长${term.maximumDays}天${term.revolving ? "，可循环" : ""}`;
  }
  if (Number.isFinite(term.creditMaximumMonths)) {
    const draw = Number.isFinite(term.drawMaximumMonths) ? `，单笔最长${term.drawMaximumMonths}个月` : "";
    return `授信最长${term.creditMaximumMonths}个月${draw}${term.revolving ? "，可循环" : ""}`;
  }
  if (Number.isFinite(term.maximumMonths)) {
    return `最长${term.maximumMonths}个月${term.revolving ? "，可循环" : ""}`;
  }
  return "目录暂未提供";
};

const formatPricing = (pricing = {}) => {
  const rate = pricing.annualizedRate;
  if (rate?.minimum != null && rate?.maximum != null) return `年化${rate.minimum}-${rate.maximum}`;
  if (rate?.minimum != null) return `年化${rate.minimum}`;
  return pricing.note ?? "目录暂未提供";
};

const targetMessages = (product) => {
  const targetIds = TARGET_RULE_IDS[product.id] ?? [];
  return targetIds
    .map((ruleId) => product.ruleSet.find((rule) => rule.id === ruleId))
    .filter((rule) => rule?.internalReason == null && typeof rule?.message === "string")
    .map((rule) => rule.message);
};

const catalogProduct = (product) => ({
  id: product.id,
  institution: product.institution,
  name: product.name,
  currency: product.currency,
  limit: formatLimit(product.limit),
  term: formatTerm(product.term),
  targetProfile: targetMessages(product).join("；"),
});

const catalogProductFor = (reportProduct, products) => products.find((product) => (
  product.id === reportProduct?.productId
  || (product.name === reportProduct?.name && product.institution === reportProduct?.institution)
));

const formatEstimatedAmount = (estimatedAmount, fallback) => {
  if (estimatedAmount?.note) return estimatedAmount.note;
  const minimum = formatAmountValue(estimatedAmount?.min);
  const maximum = formatAmountValue(estimatedAmount?.max);
  const unit = currencyUnit(estimatedAmount?.currency);
  if (minimum != null && maximum != null) {
    return minimum === maximum ? `${minimum}${unit}` : `${minimum}-${maximum}${unit}`;
  }
  return fallback ?? "待资金方进一步核定";
};

const safeReportProduct = (reportProduct, products) => {
  if (reportProduct == null || typeof reportProduct !== "object") return null;
  const catalog = catalogProductFor(reportProduct, products);
  const prerequisite = catalog == null ? null : targetMessages(catalog)[0] ?? null;
  const limit = reportProduct.limit ?? (catalog == null ? null : formatLimit(catalog.limit));
  const currency = reportProduct.estimatedAmount?.currency ?? reportProduct.currency ?? catalog?.currency ?? "";

  return {
    productId: reportProduct.productId ?? catalog?.id ?? null,
    institution: reportProduct.institution ?? catalog?.institution ?? "",
    name: reportProduct.name ?? catalog?.name ?? "",
    whyMatched: Array.isArray(reportProduct.whyMatched)
      ? reportProduct.whyMatched.filter((reason) => typeof reason === "string").slice(0, 3)
      : [],
    amount: formatEstimatedAmount(reportProduct.estimatedAmount, limit),
    currency,
    term: reportProduct.term ?? (catalog == null ? "目录暂未提供" : formatTerm(catalog.term)),
    pricing: reportProduct.pricing ?? (catalog == null ? "目录暂未提供" : formatPricing(catalog.pricing)),
    limit,
    keyPrerequisite: prerequisite,
  };
};

const scenarioLabelFor = (productId) => SCENARIOS.find((scenario) => (
  scenario.productIds.includes(productId)
))?.label ?? null;

const alternativeDifferences = (alternative, primary) => {
  const differences = [];
  const scenario = scenarioLabelFor(alternative.productId);
  if (scenario != null && scenario !== scenarioLabelFor(primary?.productId)) differences.push(`业务场景：${scenario}`);
  if (alternative.currency && alternative.currency !== primary?.currency) differences.push(`币种：${alternative.currency}`);
  if (alternative.term && alternative.term !== primary?.term) differences.push(`期限：${alternative.term}`);
  if (alternative.pricing && alternative.pricing !== primary?.pricing) differences.push(`定价：${alternative.pricing}`);
  if (alternative.amount && alternative.amount !== primary?.amount) differences.push(`参考额度：${alternative.amount}`);
  if (differences.length === 0 && alternative.keyPrerequisite) differences.push(`核心前置条件：${alternative.keyPrerequisite}`);
  return differences.slice(0, 2);
};

const buildCatalogView = (products) => ({
  state: "catalog",
  groups: SCENARIOS.map((scenario) => ({
    id: scenario.id,
    label: scenario.label,
    products: scenario.productIds
      .map((productId) => products.find((product) => product.id === productId))
      .filter(Boolean)
      .map(catalogProduct),
  })),
});

const buildReportView = (report, products) => {
  const primary = safeReportProduct(report.primary, products);
  const missingDocuments = Array.isArray(report.missingDocuments)
    ? report.missingDocuments.filter((item) => typeof item === "string").slice(0, 5)
    : [];
  const alternatives = (Array.isArray(report.alternatives) ? report.alternatives : [])
    .slice(0, 2)
    .map((product) => safeReportProduct(product, products))
    .filter(Boolean)
    .map((product) => ({
      ...product,
      differences: alternativeDifferences(product, primary),
      missingInformation: missingDocuments.slice(0, 2),
    }));
  const nonMatches = (Array.isArray(report.nonMatches) ? report.nonMatches : [])
    .filter((item) => item != null && typeof item === "object")
    .map((item) => ({
      institution: typeof item.institution === "string" ? item.institution : "",
      name: typeof item.name === "string" ? item.name : "",
      reason: typeof item.reason === "string" ? item.reason : "",
    }));

  return {
    state: "report",
    summary: typeof report.summary === "string" ? report.summary : "",
    primary,
    alternatives,
    missingDocuments,
    nonMatches,
    disclaimer: MATCH_DISCLAIMER,
  };
};

export function buildProductMatchView(report, products = []) {
  return report == null ? buildCatalogView(products) : buildReportView(report, products);
}

export function scrollProductMatchCenterIntoView(element, windowObject = globalThis.window) {
  if (element == null) return false;
  const reducedMotion = typeof windowObject?.matchMedia === "function"
    && windowObject.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const options = { behavior: reducedMotion ? "auto" : "smooth", block: "start" };

  if (typeof element.scrollIntoView === "function") {
    try {
      element.scrollIntoView(options);
      return true;
    } catch {
      try {
        element.scrollIntoView(true);
        return true;
      } catch {
        // Fall through to a positional scroll for older WebKit variants.
      }
    }
  }

  if (typeof element.getBoundingClientRect === "function" && typeof windowObject?.scrollTo === "function") {
    const top = element.getBoundingClientRect().top + (windowObject.pageYOffset ?? 0);
    windowObject.scrollTo(0, top);
    return true;
  }

  return false;
}

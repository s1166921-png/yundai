const readPath = (value, path) => path.split(".").reduce((current, key) => current?.[key], value);

const isUnknown = (value) => value == null || (Array.isArray(value) && value.length === 0);

const RATING_RANKS = Object.freeze({
  "5C": 1,
  "5C+": 2,
  "5B": 3,
  "5B+": 4,
  "5A": 5,
  "5A+": 6,
  "6A": 7,
  "6A+": 8,
  "6AA": 9,
  "6AAA": 10,
});

const hasRequiredCurrency = (rule, profile) => {
  if (!rule.value.currencyField) return true;
  return readPath(profile, rule.value.currencyField) === rule.value.requiredCurrency;
};

const allTruthy = (rule, profile) => {
  const values = rule.value.fields.map((field) => readPath(profile, field));
  if (values.some((value) => value === false)) return "failed";
  return values.some(isUnknown) ? "unknown" : "passed";
};

const anyFieldEquals = (rule, profile) => {
  const values = rule.value.fields.map(({ field, value }) => ({ actual: readPath(profile, field), value }));
  if (values.some(({ actual, value }) => actual === value)) return "passed";
  return values.some(({ actual }) => isUnknown(actual)) ? "unknown" : "failed";
};

const arrayIncludes = (rule, profile, actual) => {
  if (isUnknown(actual)) return "unknown";
  return Array.isArray(actual) && actual.includes(rule.value.value) ? "passed" : "failed";
};

const belowPercentage = (rule, profile, actual) => isUnknown(actual) ? "unknown" : actual < rule.value.threshold ? "passed" : "failed";

const abovePercentage = (rule, profile, actual) => isUnknown(actual) ? "unknown" : actual > rule.value.threshold ? "failed" : "passed";

const companyAgeOrRating = (rule, profile, actual) => {
  if (isUnknown(actual)) return "unknown";
  if (actual >= rule.value.minimumMonths) return "passed";
  if (actual < rule.value.minimumMonthsWithRating) return "failed";
  const rating = readPath(profile, rule.value.ratingField);
  if (isUnknown(rating)) return "unknown";
  return RATING_RANKS[rating] >= RATING_RANKS[rule.value.minimumRating] ? "passed" : "failed";
};

const conditionalAllTruthy = (rule, profile, actual) => {
  if (isUnknown(actual) || !hasRequiredCurrency(rule, profile)) return "unknown";
  if (actual < rule.value.whenAtLeast) return "passed";
  const values = rule.value.requiresAllTruthy.map((field) => profile[field]);
  if (values.some((value) => value === false)) return "failed";
  return values.some(isUnknown) ? "unknown" : "passed";
};

const logisticsAdditionalConditions = (rule, profile, actual) => {
  if (isUnknown(actual) || !hasRequiredCurrency(rule, profile)) return "unknown";
  if (actual <= rule.value.whenAbove) return "passed";
  const taxInvoiceQuality = readPath(profile, rule.value.taxInvoiceQualityField);
  const revenueShare = readPath(profile, rule.value.revenueShareField);
  const companyAge = readPath(profile, rule.value.companyAgeField);
  const hasAlternative = taxInvoiceQuality === rule.value.qualifyingTaxInvoiceTier
    || revenueShare >= rule.value.minimumRevenueShare;

  if (!hasAlternative && !isUnknown(taxInvoiceQuality) && !isUnknown(revenueShare)) return "failed";
  if (companyAge < rule.value.minimumCompanyAgeMonths) return "failed";
  if (isUnknown(companyAge) || (!hasAlternative && (isUnknown(taxInvoiceQuality) || isUnknown(revenueShare)))) return "unknown";
  return "passed";
};

const coreAssetLiability = (rule, profile, actual) => {
  if (isUnknown(actual) || !hasRequiredCurrency(rule, profile)) return "unknown";
  const taxTier = readPath(profile, rule.value.nonTaxInvoiceField);
  const nonTaxInvoice = taxTier === rule.value.nonTaxInvoiceValue;
  const aboveAmount = actual > rule.value.whenAbove;
  if (!aboveAmount && isUnknown(taxTier)) return "unknown";
  if (!aboveAmount && !nonTaxInvoice) return "passed";

  const ratio = readPath(profile, rule.value.ratioField);
  if (isUnknown(ratio)) return "unknown";
  return ratio <= rule.value.maximumRatio ? "passed" : "failed";
};

const logisticsDebtRatio = (rule, profile, actual) => {
  const { industry, taxRecordAndInvoiceCustomerTier: tier } = profile;
  if (isUnknown(actual) || isUnknown(industry) || isUnknown(tier)) return "unknown";
  const thresholds = tier === "tax_invoice" ? rule.value.taxInvoice : rule.value.nonTaxInvoice;
  const threshold = thresholds[industry];
  return threshold == null ? "failed" : actual <= threshold ? "passed" : "failed";
};

const notDisallowed = (rule, profile, actual) => isUnknown(actual) ? "unknown" : rule.value.disallowed.includes(actual) ? "failed" : "passed";

const singleStoreHistory = (rule, profile, actual) => {
  if (isUnknown(actual)) return "unknown";
  if (actual !== 1) return actual > 1 ? "passed" : "failed";
  const history = readPath(profile, rule.value.historyField);
  if (isUnknown(history)) return "unknown";
  return history > rule.value.minimumMonths ? "passed" : "failed";
};

const ratingAtLeast = (rule, profile, actual) => {
  if (isUnknown(actual)) return "unknown";
  return RATING_RANKS[actual] >= RATING_RANKS[rule.value.minimumRating] ? "passed" : "failed";
};

const CUSTOM_EVALUATORS = Object.freeze({
  allTruthy,
  anyFieldEquals,
  arrayIncludes,
  abovePercentage,
  belowPercentage,
  companyAgeOrRating,
  conditionalAllTruthy,
  coreAssetLiability,
  logisticsAdditionalConditions,
  logisticsDebtRatio,
  notDisallowed,
  ratingAtLeast,
  singleStoreHistory,
});

const evaluateStandard = (operator, actual, expected) => {
  switch (operator) {
    case "equals": return actual === expected ? "passed" : "failed";
    case "oneOf":
      return Array.isArray(actual)
        ? actual.some((value) => expected.includes(value)) ? "passed" : "failed"
        : expected.includes(actual) ? "passed" : "failed";
    case "minExclusive": return actual > expected ? "passed" : "failed";
    case "minInclusive": return actual >= expected ? "passed" : "failed";
    case "maxInclusive": return actual <= expected ? "passed" : "failed";
    case "truthy": return actual === true ? "passed" : "failed";
    case "falsy": return actual === false ? "passed" : "failed";
    default: return "failed";
  }
};

export function evaluateRule(rule, profile = {}) {
  const actual = readPath(profile, rule.field);
  let status;

  if (rule.operator === "custom") {
    const evaluatorName = rule.value?.evaluator;
    const evaluator = Object.hasOwn(CUSTOM_EVALUATORS, evaluatorName)
      ? CUSTOM_EVALUATORS[evaluatorName]
      : undefined;
    status = evaluator ? evaluator(rule, profile, actual) : "failed";
  } else if (isUnknown(actual)) {
    status = "unknown";
  } else {
    status = evaluateStandard(rule.operator, actual, rule.value);
  }

  return {
    id: rule.id,
    field: rule.field,
    severity: rule.severity,
    status,
    message: rule.message,
    ...(rule.internalReason == null ? {} : { internalReason: rule.internalReason }),
  };
}

export function evaluateEligibility(product, profile) {
  const results = product.ruleSet.map((rule) => evaluateRule(rule, profile));
  const hardFailure = results.some((result) => result.severity === "hard" && result.status === "failed");
  const missing = results.some((result) => result.status === "unknown");

  return {
    status: hardFailure ? "ineligible" : missing ? "needs_information" : "eligible",
    passedRules: results.filter((result) => result.status === "passed"),
    failedRules: results.filter((result) => result.status === "failed"),
    missingFields: [...new Set(results.filter((result) => result.status === "unknown").map((result) => result.field))],
  };
}

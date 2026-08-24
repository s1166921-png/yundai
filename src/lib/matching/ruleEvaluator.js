const readPath = (value, path) => path.split(".").reduce((current, key) => current?.[key], value);

const isUnknown = (value) => value == null || value === "" || (Array.isArray(value) && value.length === 0);
const missing = (...fields) => ({
  status: "unknown",
  missingFields: [...new Set(fields.flat().filter(Boolean))],
});

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

const currencyApplicability = (rule, profile) => {
  const field = rule.value.currencyField;
  if (!field) return { applies: true };
  const currency = readPath(profile, field);
  if (isUnknown(currency)) return { applies: null, missingFields: [field] };
  return { applies: currency === rule.value.requiredCurrency };
};

const allTruthy = (rule, profile) => {
  const fields = rule.value.fields;
  const values = fields.map((field) => readPath(profile, field));
  if (values.some((value) => value === false)) return "failed";
  const missingFields = fields.filter((field, index) => isUnknown(values[index]));
  return missingFields.length > 0 ? missing(missingFields) : "passed";
};

const anyTruthy = (rule, profile) => {
  const fields = rule.value.fields;
  const values = fields.map((field) => readPath(profile, field));
  if (values.some((value) => value === true)) return "passed";
  const missingFields = fields.filter((field, index) => isUnknown(values[index]));
  return missingFields.length > 0 ? missing(missingFields) : "failed";
};

const anyFieldEquals = (rule, profile) => {
  const comparisons = rule.value.fields.map(({ field, value }) => ({
    field,
    actual: readPath(profile, field),
    expected: value,
  }));
  if (comparisons.some(({ actual, expected }) => actual === expected)) return "passed";
  const missingFields = comparisons.filter(({ actual }) => isUnknown(actual)).map(({ field }) => field);
  return missingFields.length > 0 ? missing(missingFields) : "failed";
};

const buyerEligibility = (rule, profile) => {
  const {
    platformTypeField,
    admittedPlatformType,
    countryEligibilityField,
    admittedCountryValue,
    rejectedCountryValue,
    reviewCountryValue,
  } = rule.value;
  const platformType = readPath(profile, platformTypeField);
  const countryEligibility = readPath(profile, countryEligibilityField);

  if (platformType === admittedPlatformType || countryEligibility === admittedCountryValue) return "passed";
  if (platformType === "other" && countryEligibility === rejectedCountryValue) return "failed";

  const missingFields = [];
  if (isUnknown(platformType)) missingFields.push(platformTypeField);
  if (isUnknown(countryEligibility) || countryEligibility === reviewCountryValue) {
    missingFields.push(countryEligibilityField);
  }
  return missingFields.length > 0 ? missing(missingFields) : "failed";
};

const arrayIncludes = (rule, _profile, actual) => (
  isUnknown(actual)
    ? missing(rule.field)
    : Array.isArray(actual) && actual.includes(rule.value.value) ? "passed" : "failed"
);

const belowPercentage = (rule, _profile, actual) => (
  isUnknown(actual) ? missing(rule.field) : actual < rule.value.threshold ? "passed" : "failed"
);

const abovePercentage = (rule, _profile, actual) => (
  isUnknown(actual) ? missing(rule.field) : actual > rule.value.threshold ? "failed" : "passed"
);

const companyAgeOrRating = (rule, profile, actual) => {
  if (isUnknown(actual)) return missing(rule.field);
  if (actual >= rule.value.minimumMonths) return "passed";
  if (actual < rule.value.minimumMonthsWithRating) return "failed";
  const rating = readPath(profile, rule.value.ratingField);
  if (isUnknown(rating)) return missing(rule.value.ratingField);
  return RATING_RANKS[rating] >= RATING_RANKS[rule.value.minimumRating] ? "passed" : "failed";
};

const conditionalAllTruthy = (rule, profile, actual) => {
  const applicability = currencyApplicability(rule, profile);
  if (applicability.applies == null) return missing(applicability.missingFields);
  if (!applicability.applies) return "passed";
  if (isUnknown(actual)) return missing(rule.field);
  if (actual < rule.value.whenAtLeast) return "passed";

  const fields = rule.value.requiresAllTruthy;
  const values = fields.map((field) => readPath(profile, field));
  if (values.some((value) => value === false)) return "failed";
  const missingFields = fields.filter((field, index) => isUnknown(values[index]));
  return missingFields.length > 0 ? missing(missingFields) : "passed";
};

const logisticsAdditionalConditions = (rule, profile, actual) => {
  const applicability = currencyApplicability(rule, profile);
  if (applicability.applies == null) return missing(applicability.missingFields);
  if (!applicability.applies) return "passed";
  if (isUnknown(actual)) return missing(rule.field);
  if (actual <= rule.value.whenAbove) return "passed";

  const taxField = rule.value.taxInvoiceQualityField;
  const revenueField = rule.value.revenueShareField;
  const ageField = rule.value.companyAgeField;
  const taxInvoiceQuality = readPath(profile, taxField);
  const revenueShare = readPath(profile, revenueField);
  const companyAge = readPath(profile, ageField);
  const hasAlternative = taxInvoiceQuality === rule.value.qualifyingTaxInvoiceTier
    || (!isUnknown(revenueShare) && revenueShare >= rule.value.minimumRevenueShare);

  if (!isUnknown(companyAge) && companyAge < rule.value.minimumCompanyAgeMonths) return "failed";
  if (!hasAlternative && !isUnknown(taxInvoiceQuality) && !isUnknown(revenueShare)) return "failed";

  const missingFields = [];
  if (isUnknown(companyAge)) missingFields.push(ageField);
  if (!hasAlternative) {
    if (isUnknown(taxInvoiceQuality)) missingFields.push(taxField);
    if (isUnknown(revenueShare)) missingFields.push(revenueField);
  }
  return missingFields.length > 0 ? missing(missingFields) : "passed";
};

const coreAssetLiability = (rule, profile, actual) => {
  const applicability = currencyApplicability(rule, profile);
  if (applicability.applies == null) return missing(applicability.missingFields);
  if (!applicability.applies) return "passed";
  if (isUnknown(actual)) return missing(rule.field);

  const tierField = rule.value.nonTaxInvoiceField;
  const taxTier = readPath(profile, tierField);
  const aboveAmount = actual > rule.value.whenAbove;
  if (!aboveAmount && !isUnknown(taxTier) && taxTier !== rule.value.nonTaxInvoiceValue) return "passed";
  if (!aboveAmount && isUnknown(taxTier)) return missing(tierField);

  const ratio = readPath(profile, rule.value.ratioField);
  if (isUnknown(ratio)) return missing(rule.value.ratioField);
  return ratio <= rule.value.maximumRatio ? "passed" : "failed";
};

const logisticsDebtRatio = (rule, profile, actual) => {
  const dependencies = [
    [rule.field, actual],
    ["industry", profile.industry],
    ["taxRecordAndInvoiceCustomerTier", profile.taxRecordAndInvoiceCustomerTier],
  ];
  const missingFields = dependencies.filter(([, value]) => isUnknown(value)).map(([field]) => field);
  if (missingFields.length > 0) return missing(missingFields);

  const thresholds = profile.taxRecordAndInvoiceCustomerTier === "tax_invoice"
    ? rule.value.taxInvoice
    : rule.value.nonTaxInvoice;
  const threshold = thresholds[profile.industry];
  return threshold == null ? "failed" : actual <= threshold ? "passed" : "failed";
};

const notDisallowed = (rule, _profile, actual) => (
  isUnknown(actual) ? missing(rule.field) : rule.value.disallowed.includes(actual) ? "failed" : "passed"
);

const singleStoreHistory = (rule, profile, actual) => {
  if (isUnknown(actual)) return missing(rule.field);
  if (actual !== 1) return actual > 1 ? "passed" : "failed";
  const history = readPath(profile, rule.value.historyField);
  if (isUnknown(history)) return missing(rule.value.historyField);
  return history > rule.value.minimumMonths ? "passed" : "failed";
};

const ratingAtLeast = (rule, _profile, actual) => {
  if (isUnknown(actual)) return missing(rule.field);
  return RATING_RANKS[actual] >= RATING_RANKS[rule.value.minimumRating] ? "passed" : "failed";
};

const CUSTOM_EVALUATORS = Object.freeze({
  allTruthy,
  anyTruthy,
  anyFieldEquals,
  arrayIncludes,
  abovePercentage,
  belowPercentage,
  buyerEligibility,
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
  let evaluation;

  if (rule.operator === "custom") {
    const evaluatorName = rule.value?.evaluator;
    const evaluator = typeof evaluatorName === "string" && Object.hasOwn(CUSTOM_EVALUATORS, evaluatorName)
      ? CUSTOM_EVALUATORS[evaluatorName]
      : undefined;
    evaluation = evaluator ? evaluator(rule, profile, actual) : "failed";
  } else if (isUnknown(actual)) {
    evaluation = missing(rule.field);
  } else {
    evaluation = evaluateStandard(rule.operator, actual, rule.value);
  }

  const normalized = typeof evaluation === "string" ? { status: evaluation } : evaluation;
  return {
    id: rule.id,
    field: rule.field,
    severity: rule.severity,
    status: normalized.status,
    message: rule.message,
    ...(rule.internalReason == null ? {} : { internalReason: rule.internalReason }),
    ...(normalized.status === "unknown" ? { missingFields: normalized.missingFields } : {}),
  };
}

export function evaluateEligibility(product, profile) {
  const results = product.ruleSet.map((rule) => evaluateRule(rule, profile));
  const hardFailure = results.some((result) => result.severity === "hard" && result.status === "failed");
  const missingFields = [...new Set(results
    .filter((result) => result.status === "unknown")
    .flatMap((result) => result.missingFields ?? [result.field]))];

  return {
    status: hardFailure ? "ineligible" : missingFields.length > 0 ? "needs_information" : "eligible",
    passedRules: results.filter((result) => result.status === "passed"),
    failedRules: results.filter((result) => result.status === "failed"),
    missingFields,
  };
}

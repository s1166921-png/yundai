import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRule, evaluateEligibility } from "../src/lib/matching/ruleEvaluator.js";

const minRule = {
  id: "gmv",
  field: "singleStoreGmv.amount",
  operator: "minExclusive",
  value: 5000000,
  severity: "hard",
  message: "单店年 GMV 需超过 500 万美元",
};

test("missing values are unknown, explicit failures are failed", () => {
  assert.equal(evaluateRule(minRule, { singleStoreGmv: { amount: null } }).status, "unknown");
  assert.equal(evaluateRule(minRule, { singleStoreGmv: { amount: 5000000 } }).status, "failed");
  assert.equal(evaluateRule(minRule, { singleStoreGmv: { amount: 5000001 } }).status, "passed");
});

test("eligibility prioritizes hard failure over missing data", () => {
  const product = {
    ruleSet: [
      minRule,
      { ...minRule, id: "history", field: "platformHistoryMonths", operator: "minExclusive", value: 12 },
    ],
  };

  assert.equal(evaluateEligibility(product, {
    singleStoreGmv: { amount: 4000000 },
    platformHistoryMonths: null,
  }).status, "ineligible");
  assert.equal(evaluateEligibility(product, {
    singleStoreGmv: { amount: 6000000 },
    platformHistoryMonths: null,
  }).status, "needs_information");
});

test("standard operators retain three-state outcomes and unanswered lists are unknown", () => {
  const profile = { exact: "yes", choices: ["amazon_sc"], lower: 5, upper: 5, enabled: true, disabled: false };

  assert.equal(evaluateRule({ field: "exact", operator: "equals", value: "yes" }, profile).status, "passed");
  assert.equal(evaluateRule({ field: "choices", operator: "oneOf", value: ["amazon_sc"] }, profile).status, "passed");
  assert.equal(evaluateRule({ field: "lower", operator: "minInclusive", value: 5 }, profile).status, "passed");
  assert.equal(evaluateRule({ field: "lower", operator: "minExclusive", value: 5 }, profile).status, "failed");
  assert.equal(evaluateRule({ field: "upper", operator: "maxInclusive", value: 5 }, profile).status, "passed");
  assert.equal(evaluateRule({ field: "enabled", operator: "truthy", value: true }, profile).status, "passed");
  assert.equal(evaluateRule({ field: "disabled", operator: "falsy", value: false }, profile).status, "passed");
  assert.equal(evaluateRule({ field: "choices", operator: "oneOf", value: ["amazon_sc"] }, { choices: [] }).status, "unknown");
});

test("rule results preserve customer-safe messages and internal reasons as metadata", () => {
  const result = evaluateRule({
    id: "sensitive",
    field: "hasCurrentOverdue",
    operator: "falsy",
    value: false,
    severity: "hard",
    message: "请补充并核验企业及个人还款状态。",
    internalReason: "当前逾期",
  }, { hasCurrentOverdue: true });

  assert.deepEqual(result, {
    id: "sensitive",
    field: "hasCurrentOverdue",
    severity: "hard",
    status: "failed",
    message: "请补充并核验企业及个人还款状态。",
    internalReason: "当前逾期",
  });
});

test("custom evaluators are selected only by their internal names", () => {
  const cases = [
    [{ field: "age", operator: "custom", value: { evaluator: "companyAgeOrRating", minimumMonths: 60, minimumMonthsWithRating: 36 } }, { age: 60 }, "passed"],
    [{ field: "percentage", operator: "custom", value: { evaluator: "belowPercentage", threshold: 80 } }, { percentage: 80 }, "failed"],
    [{ field: "industry", operator: "custom", value: { evaluator: "notDisallowed", disallowed: ["restricted"] } }, { industry: "restricted" }, "failed"],
    [{ field: "requestedAmount", operator: "custom", value: { evaluator: "conditionalAllTruthy", whenAtLeast: 500000, requiresAllTruthy: ["authorization"] } }, { requestedAmount: 500000, authorization: true }, "passed"],
    [{ field: "decline", operator: "custom", value: { evaluator: "abovePercentage", threshold: 30 } }, { decline: 31 }, "failed"],
    [{ field: "ratio", operator: "custom", value: { evaluator: "logisticsDebtRatio", nonTaxInvoice: { wholesale: 50 }, taxInvoice: { wholesale: 55 } } }, { ratio: 55, industry: "wholesale", taxRecordAndInvoiceCustomerTier: "tax_invoice" }, "passed"],
    [{ field: "requestedAmount", operator: "custom", value: { evaluator: "logisticsAdditionalConditions", whenAbove: 3000000, taxInvoiceQualityField: "taxRecordAndInvoiceCustomerTier", revenueShareField: "importExportRevenueSharePercent", minimumRevenueShare: 50, companyAgeField: "companyAgeMonths", minimumCompanyAgeMonths: 60 } }, { requestedAmount: 3000001, taxRecordAndInvoiceCustomerTier: "tax_invoice", importExportRevenueSharePercent: 50, companyAgeMonths: 60 }, "passed"],
    [{ field: "requestedAmount", operator: "custom", value: { evaluator: "coreAssetLiability", whenAbove: 3000000, nonTaxInvoiceField: "taxRecordAndInvoiceCustomerTier", nonTaxInvoiceValue: "non_tax_invoice", ratioField: "coreAssetLiabilityRatioPercent", maximumRatio: 80 } }, { requestedAmount: 3000001, taxRecordAndInvoiceCustomerTier: "tax_invoice", coreAssetLiabilityRatioPercent: 80 }, "passed"],
    [{ field: "storeCount", operator: "custom", value: { evaluator: "singleStoreHistory", historyField: "platformHistoryMonths", minimumMonths: 24 } }, { storeCount: 1, platformHistoryMonths: 24 }, "failed"],
    [{ field: "sites", operator: "custom", value: { evaluator: "arrayIncludes", value: "united_states" } }, { sites: ["united_states"] }, "passed"],
    [{ field: "acceptsNoa", operator: "custom", value: { evaluator: "allTruthy", fields: ["acceptsNoa", "acceptsAccountControl"] } }, { acceptsNoa: true, acceptsAccountControl: true }, "passed"],
    [{ field: "buyerCountry", operator: "custom", value: { evaluator: "anyFieldEquals", fields: [{ field: "buyerCountry", value: "admitted" }] } }, { buyerCountry: "admitted" }, "passed"],
  ];

  for (const [rule, profile, expectedStatus] of cases) {
    assert.equal(evaluateRule(rule, profile).status, expectedStatus);
  }
  assert.equal(evaluateRule({ field: "value", operator: "custom", value: { evaluator: "notProvided" } }, { value: true }).status, "failed");
});

test("custom composites inspect explicit failures when their anchor is unanswered", () => {
  const rule = {
    field: "acceptsNoa",
    operator: "custom",
    value: { evaluator: "allTruthy", fields: ["acceptsNoa", "acceptsAccountControl"] },
  };

  assert.equal(evaluateRule(rule, { acceptsNoa: null, acceptsAccountControl: false }).status, "failed");
});

test("prototype properties are not custom evaluators", () => {
  const rule = { field: "value", operator: "custom", value: { evaluator: "constructor" } };

  assert.equal(evaluateRule(rule, { value: true }).status, "failed");
  assert.equal(evaluateRule({ ...rule, value: { evaluator: "toString" } }, { value: true }).status, "failed");
});

test("custom evaluators report the actual unanswered dependency paths", () => {
  const allTruthyResult = evaluateRule({
    id: "controls",
    field: "acceptsNoa",
    operator: "custom",
    value: { evaluator: "allTruthy", fields: ["acceptsNoa", "acceptsAccountControl"] },
  }, { acceptsNoa: true, acceptsAccountControl: null });
  const companyAgeResult = evaluateRule({
    id: "age-or-rating",
    field: "companyAgeMonths",
    operator: "custom",
    value: {
      evaluator: "companyAgeOrRating",
      minimumMonths: 60,
      minimumMonthsWithRating: 36,
      ratingField: "companyCreditRating",
      minimumRating: "5C+",
    },
  }, { companyAgeMonths: 40, companyCreditRating: null });

  assert.deepEqual(allTruthyResult.missingFields, ["acceptsAccountControl"]);
  assert.deepEqual(companyAgeResult.missingFields, ["companyCreditRating"]);
  assert.deepEqual(evaluateEligibility({ ruleSet: [{
    id: "controls",
    field: "acceptsNoa",
    operator: "custom",
    value: { evaluator: "allTruthy", fields: ["acceptsNoa", "acceptsAccountControl"] },
  }] }, { acceptsNoa: true }).missingFields, ["acceptsAccountControl"]);
});

test("non-applicable currency conditions are neutral instead of pretending data is missing", () => {
  const result = evaluateRule({
    id: "rmb-only",
    field: "requestedAmount.amount",
    operator: "custom",
    value: {
      evaluator: "conditionalAllTruthy",
      whenAtLeast: 500000,
      currencyField: "requestedAmount.currency",
      requiredCurrency: "RMB",
      requiresAllTruthy: ["authorization"],
    },
  }, {
    requestedAmount: { amount: 800000, currency: "USD" },
    authorization: false,
  });

  assert.equal(result.status, "passed");
  assert.equal(result.missingFields, undefined);

  const unansweredAmount = evaluateRule({
    id: "rmb-only-unanswered-amount",
    field: "requestedAmount.amount",
    operator: "custom",
    value: {
      evaluator: "conditionalAllTruthy",
      whenAtLeast: 500000,
      currencyField: "requestedAmount.currency",
      requiredCurrency: "RMB",
      requiresAllTruthy: ["authorization"],
    },
  }, { requestedAmount: { amount: null, currency: "USD" } });
  assert.equal(unansweredAmount.status, "passed");
  assert.equal(unansweredAmount.missingFields, undefined);
});

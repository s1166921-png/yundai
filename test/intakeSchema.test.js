import test from "node:test";
import assert from "node:assert/strict";
import {
  INTAKE_STEPS,
  getVisibleIntakeFields,
  validateIntakeStep,
} from "../src/lib/matching/intakeSchema.js";

const keysFor = (businessModels, mode = "complex") => (
  getVisibleIntakeFields({ businessModels }, mode).map((field) => field.key)
);

test("defines five stable wizard steps with complete field metadata", () => {
  assert.deepEqual(INTAKE_STEPS.map((step) => step.id), [1, 2, 3, 4, 5]);

  const fields = getVisibleIntakeFields({
    businessModels: [
      "amazon_sc",
      "amazon_vc",
      "platform_ecommerce",
      "b2b_supermarket",
      "general_import_export",
      "processing_manufacturing",
      "wholesale_retail",
      "other",
    ],
  }, "complex");

  for (const field of fields) {
    for (const property of ["key", "step", "label", "type", "options", "requiredFor", "visibleWhen", "unit", "help"]) {
      assert.ok(Object.hasOwn(field, property), `${field.key} is missing ${property}`);
    }
  }
});

test("Amazon SC reveals store fields and hides customs fields", () => {
  const keys = keysFor(["amazon_sc"]);
  assert.ok(keys.includes("singleStoreGmvUsd"));
  assert.ok(keys.includes("platformHistoryMonths"));
  assert.ok(keys.includes("acceptsAccountControl"));
  assert.ok(keys.includes("hasCompatibleCollectionAccount"));
  assert.ok(keys.includes("hasMaterialCreditOrJudicialNegative"));
  assert.ok(!keys.includes("customsCreditClassification"));
});

test("Amazon VC reveals US site, entity, and receivables fields", () => {
  const keys = keysFor(["amazon_vc"]);
  assert.ok(keys.includes("platformSites"));
  assert.ok(keys.includes("borrowerMatchesCollectionEntity"));
  assert.ok(keys.includes("accountsReceivableBalanceUsd"));
  assert.ok(keys.includes("amazonAnnualGmvUsd"));
  assert.ok(keys.includes("acceptsAccountControl"));
  assert.ok(!keys.includes("customsCreditClassification"));
});

test("platform ecommerce reveals account, repayment, refund, and FBA fields", () => {
  const keys = keysFor(["platform_ecommerce"]);
  assert.ok(keys.includes("amazonAhrScore"));
  assert.ok(keys.includes("allStoreRepaymentsRmb"));
  assert.ok(keys.includes("refundRatePercent"));
  assert.ok(keys.includes("fbaInventoryTurnoverCount"));
  assert.ok(keys.includes("averageMonthlyFbaInventoryValueUsd"));
});

test("general import export reveals canonical customs and FX fields", () => {
  const keys = keysFor(["general_import_export"]);
  assert.ok(keys.includes("importExportAmountLast12MonthsUsd"));
  assert.ok(keys.includes("foreignExchangeClassification"));
  assert.ok(keys.includes("selfOperatedImportExport"));
  assert.ok(keys.includes("controllerIndustryExperienceYears"));
  assert.ok(keys.includes("customsCreditClassification"));
  assert.ok(!keys.includes("singleStoreGmvUsd"));
});

test("B2B supermarket reveals buyer, trade history, receivables, and NOA fields", () => {
  const keys = keysFor(["b2b_supermarket"]);
  assert.ok(keys.includes("buyerName"));
  assert.ok(keys.includes("buyerCountry"));
  assert.ok(keys.includes("buyerCountryEligibility"));
  assert.ok(keys.includes("buyerTradingHistoryMonths"));
  assert.ok(keys.includes("accountsReceivableBalanceUsd"));
  assert.ok(keys.includes("acceptsNoa"));
  assert.ok(keys.includes("acceptsReceivablesAssignment"));
  assert.ok(keys.includes("acceptsAccountControl"));
});

test("manufacturing, wholesale, and other models receive coherent operating fields", () => {
  const manufacturing = keysFor(["processing_manufacturing"]);
  const wholesale = keysFor(["wholesale_retail"]);
  const other = keysFor(["other"]);

  assert.ok(manufacturing.includes("hasFixedBusinessPremises"));
  assert.ok(manufacturing.includes("controllerIndustryExperienceYears"));
  assert.ok(wholesale.includes("primaryPlatformOrBuyerName"));
  assert.ok(wholesale.includes("allStoreSalesRmb"));
  assert.ok(wholesale.includes("controllerIndustryExperienceYears"));
  assert.ok(wholesale.includes("selfOperatedImportExport"));
  assert.ok(wholesale.includes("customsCreditClassification"));
  assert.ok(other.includes("primaryPlatformOrBuyerName"));
});

test("buyer, purpose, repayment, and industry values use controlled selections", () => {
  const fields = getVisibleIntakeFields({ businessModels: ["b2b_supermarket"] }, "complex");
  const byKey = new Map(fields.map((field) => [field.key, field]));

  assert.equal(byKey.get("buyerPlatformType").type, "select");
  assert.deepEqual(byKey.get("buyerPlatformType").options.map(({ value }) => value), [
    "admitted_1p_retailer",
    "other",
  ]);
  assert.equal(byKey.get("buyerCountryEligibility").type, "select");
  assert.deepEqual(byKey.get("buyerCountryEligibility").options.map(({ value }) => value), [
    "confirmed_admitted",
    "confirmed_not_admitted",
    "needs_review",
  ]);
  assert.equal(byKey.get("fundUse").type, "select");
  assert.equal(byKey.get("preferredRepaymentMethod").type, "select");
  assert.equal(byKey.get("industry").type, "select");
});

test("multiple business models merge branches without duplicate fields", () => {
  const keys = keysFor(["amazon_sc", "general_import_export", "b2b_supermarket"]);
  assert.equal(keys.length, new Set(keys).size);
  assert.ok(keys.includes("singleStoreGmvUsd"));
  assert.ok(keys.includes("customsCreditClassification"));
  assert.ok(keys.includes("buyerName"));
});

test("simple mode keeps only base intake fields across all five steps", () => {
  const fields = getVisibleIntakeFields({ businessModels: ["amazon_sc"] }, "simple");
  const keys = fields.map((field) => field.key);

  assert.deepEqual([...new Set(fields.map((field) => field.step))], [1, 2, 3, 4, 5]);
  assert.ok(keys.includes("companyName"));
  assert.ok(keys.includes("businessModels"));
  assert.ok(keys.includes("primaryPlatformOrBuyerName"));
  assert.ok(keys.includes("annualRevenueRmb"));
  assert.ok(keys.includes("requestedAmount"));
  assert.ok(keys.includes("consentToDataUse"));
  assert.ok(!keys.includes("singleStoreGmvUsd"));
  assert.ok(!keys.includes("acceptsAccountControl"));
});

test("final step requires explicit true data-use consent", () => {
  const baseProfile = {
    preferredCurrency: "rmb",
    requestedAmount: "3000000",
    fundUse: "采购备货",
  };

  for (const consentToDataUse of [undefined, false]) {
    const errors = validateIntakeStep({ ...baseProfile, consentToDataUse }, "simple", 5);
    assert.ok(errors.some((error) => error.key === "consentToDataUse"));
  }

  assert.ok(!validateIntakeStep({ ...baseProfile, consentToDataUse: true }, "simple", 5)
    .some((error) => error.key === "consentToDataUse"));
});

test("step validation reports required visible fields and ignores hidden branches", () => {
  const profile = { businessModels: ["amazon_sc"], companyName: "美鸥科技" };
  const stepOneErrors = validateIntakeStep(profile, "complex", 1);
  const stepThreeErrors = validateIntakeStep(profile, "complex", 3);

  assert.deepEqual(stepOneErrors.slice(0, 2).map((error) => error.key), ["contactName", "phone"]);
  assert.ok(stepThreeErrors.some((error) => error.key === "singleStoreGmvUsd"));
  assert.ok(!stepThreeErrors.some((error) => error.key === "customsCreditClassification"));
});

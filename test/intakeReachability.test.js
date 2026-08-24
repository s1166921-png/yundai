import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCustomerProfile, validateCustomerProfile } from "../src/lib/matching/customerProfile.js";
import { INTAKE_STEPS, getVisibleIntakeFields, validateIntakeStep } from "../src/lib/matching/intakeSchema.js";
import { matchProducts } from "../src/lib/matching/productMatcher.js";
import { buildCustomerMatchReport } from "../src/lib/matching/reportBuilder.js";

const commonPayload = Object.freeze({
  companyName: "Synthetic Reachability Co.",
  contactName: "Test Contact",
  phone: "13800138000",
  annualRevenueRmb: 12000000,
  preferredCurrency: "usd",
  requestedAmount: 1000000,
  fundUse: "inventory_procurement",
  hasCurrentOverdue: false,
  hasDishonestyRecord: false,
  hasMajorLitigation: false,
  hasAbnormalOperations: false,
  consentToDataUse: true,
});

function completeRequiredIntake(payload, mode) {
  const complete = structuredClone(payload);
  for (const field of getVisibleIntakeFields(complete, mode)) {
    if (!field.requiredFor.includes(mode) || complete[field.key] != null && complete[field.key] !== "") continue;
    if (field.key === "phone") complete[field.key] = "13800138000";
    else if (field.type === "number") complete[field.key] = Math.max(field.min ?? 0, 1);
    else if (field.type === "boolean") complete[field.key] = false;
    else if (field.type === "consent") complete[field.key] = true;
    else if (field.type === "checkboxes") complete[field.key] = [field.options[0].value];
    else if (field.type === "select") complete[field.key] = field.options[0].value;
    else complete[field.key] = `Synthetic ${field.key}`;
  }
  return complete;
}

function evaluateIntakePayload(rawPayload, productId, mode = "complex") {
  const payload = completeRequiredIntake(rawPayload, mode);
  const visibleKeys = new Set(getVisibleIntakeFields(payload, mode).map(({ key }) => key));
  for (const key of Object.keys(payload)) {
    assert.ok(visibleKeys.has(key), `${key} must be reachable in the ${payload.businessModels.join(",")} branch`);
  }
  assert.deepEqual(INTAKE_STEPS.flatMap((step) => validateIntakeStep(payload, mode, step)), []);

  const profile = normalizeCustomerProfile(payload);
  const validation = validateCustomerProfile(profile, mode);
  assert.deepEqual(validation.errors, []);
  return matchProducts(profile).find((match) => match.productId === productId);
}

test("Amazon SC intake can reach eligibility through the compatible-account exemption", () => {
  const match = evaluateIntakePayload({
    ...commonPayload,
    entityRegion: "mainland",
    entityType: "limited_company",
    businessModels: ["amazon_sc"],
    primaryPlatformOrBuyerName: "Amazon",
    platformHistoryMonths: 13,
    singleStoreGmvUsd: 6000000,
    qualifiedStoreCount: 1,
    acceptsAccountControl: false,
    hasCompatibleCollectionAccount: true,
  }, "linklogis-amazon-sc");

  assert.equal(match.status, "eligible");
});

test("Amazon VC intake exposes annual GMV and account controls needed for eligibility", () => {
  const match = evaluateIntakePayload({
    ...commonPayload,
    entityRegion: "mainland",
    entityType: "limited_company",
    businessModels: ["amazon_vc"],
    primaryPlatformOrBuyerName: "Amazon",
    platformSites: ["united_states"],
    platformHistoryMonths: 7,
    amazonAnnualGmvUsd: 2500000,
    acceptsNoa: true,
    acceptsAccountControl: true,
    acceptsReceivablesAssignment: true,
  }, "linklogis-amazon-vc");

  assert.equal(match.status, "eligible");
});

test("B2B intake reaches pass and honest review outcomes with canonical buyer selections", () => {
  const admitted = evaluateIntakePayload({
    ...commonPayload,
    entityRegion: "hong_kong",
    entityType: "limited_company",
    businessModels: ["b2b_supermarket"],
    primaryPlatformOrBuyerName: "Synthetic Buyer",
    buyerCountry: "Singapore",
    buyerPlatformType: "admitted_1p_retailer",
    buyerCountryEligibility: "needs_review",
    buyerTradingHistoryMonths: 13,
    annualB2bTradeUsd: 2500000,
    acceptsAccountControl: true,
    acceptsReceivablesAssignment: true,
  }, "linklogis-b2b-factoring");
  const review = evaluateIntakePayload({
    ...commonPayload,
    entityRegion: "hong_kong",
    entityType: "limited_company",
    businessModels: ["b2b_supermarket"],
    primaryPlatformOrBuyerName: "Synthetic Buyer",
    buyerCountry: "Unlisted market",
    buyerPlatformType: "other",
    buyerCountryEligibility: "needs_review",
    buyerTradingHistoryMonths: 13,
    annualB2bTradeUsd: 2500000,
    acceptsAccountControl: true,
    acceptsReceivablesAssignment: true,
  }, "linklogis-b2b-factoring");

  assert.equal(admitted.status, "eligible");
  assert.equal(review.status, "needs_information");
  assert.deepEqual(review.missingFields, ["buyerCountryEligibility"]);
});

test("wholesale branch exposes every logistics dependency and can reach eligibility", () => {
  const match = evaluateIntakePayload({
    ...commonPayload,
    entityRegion: "mainland",
    entityType: "limited_company",
    companyAgeMonths: 60,
    controllerIndustryExperienceYears: 5,
    industry: "批发零售",
    businessModels: ["wholesale_retail"],
    primaryPlatformOrBuyerName: "Wholesale operations",
    selfOperatedImportExport: true,
    hasImportExportLicense: true,
    importExportAmountLast12MonthsUsd: 500000,
    importExportAmountMonths13To24Usd: 500000,
    daysSinceLatestImportExport: 90,
    importExportCountLast12Months: 2,
    importExportRevenueSharePercent: 50,
    commodityRevenueSharePercent: 20,
    foreignExchangeClassification: "a",
    customsCreditClassification: "一般信用企业",
    twoYearSalesDeclinePercent: 30,
    taxRecordAndInvoiceCustomerTier: "tax_invoice",
    assetLiabilityRatioPercent: 55,
    preferredCurrency: "rmb",
    requestedAmount: 3000000,
    fundUse: "logistics_working_capital",
  }, "pingan-foreign-trade-logistics-loan");

  assert.equal(match.status, "eligible");
});

test("simple intake produces only a possible direction and suppresses amount conclusions", () => {
  const payload = completeRequiredIntake({
    ...commonPayload,
    businessModels: ["amazon_sc"],
    primaryPlatformOrBuyerName: "Amazon",
  }, "simple");
  const profile = normalizeCustomerProfile(payload);
  assert.deepEqual(validateCustomerProfile(profile, "simple").errors, []);
  const report = buildCustomerMatchReport(profile, matchProducts(profile));

  assert.equal(report.primary.presentationLabel, "可能方向");
  assert.equal(report.primary.estimatedAmount, null);
});

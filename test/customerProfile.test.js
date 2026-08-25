import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCustomerProfile, validateCustomerProfile } from "../src/lib/matching/customerProfile.js";

test("normalizes progressive fields into legacy-compatible canonical facts", () => {
  const profile = normalizeCustomerProfile({
    intakeVersion: "progressive-v1",
    primaryBusinessModel: "amazon_sc",
    businessModels: ["b2b_supermarket"],
    primaryPlatformOrBuyerName: "Legacy platform",
    hasSelfOperatedImportExportQualification: "yes",
    selfOperatedImportExport: false,
    hasImportExportLicense: false,
    platformRepaymentsLast12MonthsRmb: "123456",
    allStoreRepaymentsRmb: "1",
    acceptsReceivablesArrangement: "true",
    acceptsNoa: false,
    acceptsReceivablesAssignment: false,
  });

  assert.equal(profile.intakeVersion, "progressive-v1");
  assert.equal(profile.primaryBusinessModel, "amazon_sc");
  assert.deepEqual(profile.businessModels, ["amazon_sc"]);
  assert.equal(profile.primaryPlatformOrBuyerName, "Amazon");
  assert.equal(profile.selfOperatedImportExport, true);
  assert.equal(profile.hasImportExportLicense, true);
  assert.deepEqual(profile.allStoreRepayments, { amount: 123456, currency: "RMB" });
  assert.deepEqual(profile.collectionsLast12Months, { amount: 123456, currency: "RMB" });
  assert.equal(profile.acceptsNoa, true);
  assert.equal(profile.acceptsReceivablesAssignment, true);
});

test("progressive validation is accepted and still rejects invalid canonical data", () => {
  const profile = normalizeCustomerProfile({
    intakeVersion: "progressive-v1",
    primaryBusinessModel: "tax_operations",
    annualRevenueRmb: "-1",
  });
  const result = validateCustomerProfile(profile, "progressive");

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map(({ field }) => field), ["annualRevenue"]);
});

test("progressive non-Amazon profiles derive their primary buyer name from buyerName", () => {
  const profile = normalizeCustomerProfile({
    primaryBusinessModel: "b2b_supermarket",
    buyerName: "Progressive Buyer",
    primaryPlatformOrBuyerName: "Legacy Buyer",
  });

  assert.equal(profile.primaryPlatformOrBuyerName, "Progressive Buyer");
});

test("progressive buyer admission is derived and ignores caller-supplied admission enums", () => {
  const progressiveProfile = normalizeCustomerProfile({
    intakeVersion: "progressive-v1",
    primaryBusinessModel: "b2b_supermarket",
    buyerName: "Costco",
    buyerCountry: "美国",
    buyerPlatformType: "other",
    buyerCountryEligibility: "confirmed_not_admitted",
  });
  const unknownProfile = normalizeCustomerProfile({
    intakeVersion: "progressive-v1",
    primaryBusinessModel: "b2b_supermarket",
    buyerName: "Unknown Buyer",
    buyerCountry: "未知地区",
    buyerPlatformType: "admitted_1p_retailer",
    buyerCountryEligibility: "confirmed_admitted",
  });
  const legacyProfile = normalizeCustomerProfile({
    buyerPlatformType: "admitted_1p_retailer",
    buyerCountryEligibility: "confirmed_admitted",
  });

  assert.equal(progressiveProfile.buyerPlatformType, "admitted_1p_retailer");
  assert.equal(progressiveProfile.buyerCountryEligibility, "confirmed_admitted");
  assert.equal(unknownProfile.buyerPlatformType, "other");
  assert.equal(unknownProfile.buyerCountryEligibility, "needs_review");
  assert.equal(legacyProfile.buyerPlatformType, "admitted_1p_retailer");
  assert.equal(legacyProfile.buyerCountryEligibility, "confirmed_admitted");
});

test("normalizes enums, booleans, months, percentages, and money without converting currency", () => {
  const profile = normalizeCustomerProfile({
    entityRegion: "MAINLAND",
    businessModels: ["AMAZON_SC"],
    companyAgeMonths: "36",
    annualRevenueRmb: "18000000",
    singleStoreGmvUsd: "5100000",
    acceptsAccountControl: "yes",
    refundRatePercent: "12.5",
  });
  assert.equal(profile.entityRegion, "mainland");
  assert.deepEqual(profile.businessModels, ["amazon_sc"]);
  assert.equal(profile.companyAgeMonths, 36);
  assert.deepEqual(profile.annualRevenue, { amount: 18000000, currency: "RMB" });
  assert.deepEqual(profile.singleStoreGmv, { amount: 5100000, currency: "USD" });
  assert.equal(profile.acceptsAccountControl, true);
  assert.equal(profile.refundRatePercent, 12.5);
});

test("rejects invalid percentages and negative money", () => {
  const profile = normalizeCustomerProfile({ annualRevenueRmb: "-1", refundRatePercent: "101" });
  const result = validateCustomerProfile(profile, "complex");
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map((error) => error.field).sort(), ["annualRevenue", "refundRatePercent"]);
});

test("rejects malformed JSON values for numbers and money while leaving empty values unanswered", () => {
  const profile = normalizeCustomerProfile({
    companyAgeMonths: true,
    refundRatePercent: [],
    annualRevenueRmb: false,
    annualNetProfitRmb: {},
    platformHistoryMonths: "",
    loanBalanceRmb: "",
  });
  const result = validateCustomerProfile(profile, "complex");

  assert.ok(Number.isNaN(profile.companyAgeMonths));
  assert.ok(Number.isNaN(profile.refundRatePercent));
  assert.ok(Number.isNaN(profile.annualRevenue.amount));
  assert.ok(Number.isNaN(profile.annualNetProfit.amount));
  assert.equal(profile.platformHistoryMonths, null);
  assert.equal(profile.loanBalance.amount, null);
  assert.deepEqual(result.errors.map((error) => error.field).sort(), [
    "annualNetProfit",
    "annualRevenue",
    "companyAgeMonths",
    "refundRatePercent",
  ]);
});

test("rejects structured and numeric scalar values while preserving empty unanswered fields", () => {
  const profile = normalizeCustomerProfile({
    companyName: 42,
    applicantRole: ["法人"],
    companyCreditRating: ["6AAA"],
    settlementAccountFlowNormal: [true],
    hasRiskWarning: [false],
  });
  const result = validateCustomerProfile(profile, "complex");

  assert.deepEqual(result.errors.map((error) => error.field).sort(), [
    "applicantRole",
    "companyCreditRating",
    "companyName",
    "hasRiskWarning",
    "settlementAccountFlowNormal",
  ]);

  const unansweredProfile = normalizeCustomerProfile({
    companyName: "",
    applicantRole: "",
    companyCreditRating: "",
    settlementAccountFlowNormal: "",
    hasRiskWarning: null,
  });
  const unansweredResult = validateCustomerProfile(unansweredProfile, "complex");

  assert.equal(unansweredResult.valid, true);
  assert.equal(unansweredProfile.companyName, null);
  assert.equal(unansweredProfile.applicantRole, null);
  assert.equal(unansweredProfile.companyCreditRating, null);
  assert.equal(unansweredProfile.settlementAccountFlowNormal, null);
  assert.equal(unansweredProfile.hasRiskWarning, null);
});

test("requires each canonical money field to retain its specified currency", () => {
  const profile = normalizeCustomerProfile({ annualRevenueRmb: "100", singleStoreGmvUsd: "200" });
  profile.annualRevenue = { amount: 100, currency: "USD" };
  profile.singleStoreGmv = { amount: 200, currency: "RMB" };

  const result = validateCustomerProfile(profile, "simple");

  assert.deepEqual(result.errors.map((error) => error.field).sort(), ["annualRevenue", "singleStoreGmv"]);
});

test("normalizes known platform sites and rejects unknown platform site enums", () => {
  const profile = normalizeCustomerProfile({ platformSites: ["UNITED_STATES", "other", "unknown"] });
  const result = validateCustomerProfile(profile, "simple");

  assert.deepEqual(profile.platformSites, ["united_states", "other", "unknown"]);
  assert.deepEqual(result.errors.map((error) => error.field), ["platformSites"]);
});

test("normalizes VC, buyer-admission, source-negative, and account-exemption inputs canonically", () => {
  const profile = normalizeCustomerProfile({
    amazonAnnualGmvUsd: "2500000",
    buyerPlatformType: "ADMITTED_1P_RETAILER",
    buyerCountryEligibility: "CONFIRMED_ADMITTED",
    fundUse: "RECEIVABLES_TURNOVER",
    preferredRepaymentMethod: "RECEIVABLES_COLLECTION",
    hasMaterialCreditOrJudicialNegative: false,
    hasCompatibleCollectionAccount: true,
  });
  const result = validateCustomerProfile(profile, "complex");

  assert.equal(result.valid, true);
  assert.deepEqual(profile.amazonAnnualGmv, { amount: 2500000, currency: "USD" });
  assert.equal(profile.buyerPlatformType, "admitted_1p_retailer");
  assert.equal(profile.buyerCountryEligibility, "confirmed_admitted");
  assert.equal(profile.fundUse, "receivables_turnover");
  assert.equal(profile.preferredRepaymentMethod, "receivables_collection");
  assert.equal(profile.hasMaterialCreditOrJudicialNegative, false);
  assert.equal(profile.hasCompatibleCollectionAccount, true);
  assert.equal(Object.hasOwn(profile, "raw"), false);
});

test("rejects unknown controlled buyer, purpose, and repayment selections", () => {
  const profile = normalizeCustomerProfile({
    buyerPlatformType: "magic buyer",
    buyerCountryEligibility: "probably admitted",
    fundUse: "anything",
    preferredRepaymentMethod: "whenever",
  });
  const result = validateCustomerProfile(profile, "complex");

  assert.deepEqual(result.errors.map((error) => error.field).sort(), [
    "buyerCountryEligibility",
    "buyerPlatformType",
    "fundUse",
    "preferredRepaymentMethod",
  ]);
});

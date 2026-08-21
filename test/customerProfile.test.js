import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCustomerProfile, validateCustomerProfile } from "../src/lib/matching/customerProfile.js";

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

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

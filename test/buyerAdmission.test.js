import test from "node:test";
import assert from "node:assert/strict";
import { BUYER_ADMISSION_VERSION, deriveBuyerAdmission } from "../src/lib/matching/buyerAdmission.js";

test("derives admitted buyer and country facts from normalized customer text", () => {
  assert.equal(BUYER_ADMISSION_VERSION, "2026-08-25");
  assert.deepEqual(deriveBuyerAdmission({ buyerName: "  Costco Wholesale ", buyerCountry: "美国" }), {
    buyerPlatformType: "admitted_1p_retailer",
    buyerCountryEligibility: "confirmed_admitted",
  });
  assert.deepEqual(deriveBuyerAdmission({ buyerName: "THE HOME DEPOT, INC.", buyerCountry: "United States" }), {
    buyerPlatformType: "admitted_1p_retailer",
    buyerCountryEligibility: "confirmed_admitted",
  });
});

test("unknown buyer and country inputs require review and never imply admission", () => {
  assert.deepEqual(deriveBuyerAdmission({ buyerName: "Unknown Buyer", buyerCountry: "未知地区" }), {
    buyerPlatformType: "other",
    buyerCountryEligibility: "needs_review",
  });
  assert.deepEqual(deriveBuyerAdmission({ buyerName: "", buyerCountry: "" }), {
    buyerPlatformType: "other",
    buyerCountryEligibility: null,
  });
});

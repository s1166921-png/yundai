import test from "node:test";
import assert from "node:assert/strict";
import { matchProducts } from "../src/lib/matching/productMatcher.js";

const completeAmazonScProfile = () => ({
  entityRegion: "mainland",
  entityType: "limited_company",
  businessModels: ["amazon_sc"],
  primaryPlatformOrBuyerName: "Amazon",
  platformHistoryMonths: 13,
  singleStoreGmv: { amount: 6000000, currency: "USD" },
  qualifiedStoreCount: 1,
  acceptsAccountControl: true,
  preferredCurrency: "usd",
  preferredTermMonths: 3,
});

test("Amazon SC customer ranks SC first and never recommends hard failures", () => {
  const matches = matchProducts(completeAmazonScProfile());

  assert.equal(matches[0].productId, "linklogis-amazon-sc");
  assert.ok(matches.every((match) => match.status !== "ineligible" || match.rank == null));
  assert.ok(matches.filter((match) => match.rank != null).length <= 3);
});

test("missing data lowers confidence without changing to ineligible", () => {
  const match = matchProducts({
    businessModels: ["amazon_sc"],
    singleStoreGmv: { amount: 6000000, currency: "USD" },
  }).find((item) => item.productId === "linklogis-amazon-sc");

  assert.equal(match.status, "needs_information");
  assert.ok(match.confidence < 80);
  assert.ok(match.confidence >= 0);
});

test("all products remain available while only the first three non-failures receive ranks", () => {
  const matches = matchProducts({});

  assert.equal(matches.length, 7);
  assert.deepEqual(matches.filter((match) => match.rank != null).map((match) => match.rank), [1, 2, 3]);
  assert.deepEqual(matches.slice(0, 3).map((match) => match.productId), [
    "cmb-guangdong-business-loan",
    "pingan-orange-tax-loan",
    "pingan-foreign-trade-logistics-loan",
  ]);
});

test("eligible status outranks needs-information even when its fit evidence is less complete", () => {
  const matches = matchProducts(completeAmazonScProfile());
  const firstNeedsInformation = matches.findIndex((match) => match.status === "needs_information");
  const amazonSc = matches.find((match) => match.productId === "linklogis-amazon-sc");

  assert.equal(amazonSc.status, "eligible");
  assert.ok(firstNeedsInformation > matches.indexOf(amazonSc));
});

test("matcher persists a detached profile snapshot and product rule version with every estimate", () => {
  const profile = completeAmazonScProfile();
  const match = matchProducts(profile).find((item) => item.productId === "linklogis-amazon-sc");

  profile.singleStoreGmv.amount = 1;

  assert.deepEqual(match.estimatedAmount, {
    kind: "range", currency: "USD", min: 0, max: 3000000,
    formulaKey: "linklogis_sc_v1", note: "单店最高300万美元，最终额度以机构评估为准。",
  });
  assert.equal(match.ruleVersion, "2026-08-21");
  assert.equal(match.inputSnapshot.singleStoreGmv.amount, 6000000);
});

test("fit score is bounded and reflects all catalog weighting dimensions", () => {
  const complete = matchProducts(completeAmazonScProfile())
    .find((item) => item.productId === "linklogis-amazon-sc");
  const incomplete = matchProducts({
    businessModels: ["amazon_sc"],
    singleStoreGmv: { amount: 6000000, currency: "USD" },
  }).find((item) => item.productId === "linklogis-amazon-sc");

  assert.equal(complete.fitScore, 100);
  assert.ok(incomplete.fitScore >= 0 && incomplete.fitScore < complete.fitScore);
});

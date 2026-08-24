import test from "node:test";
import assert from "node:assert/strict";
import { GOLDEN_PROFILES } from "./fixtures/customerProfiles.js";
import { PRODUCT_IDS } from "../src/lib/matching/productCatalog.js";
import { matchProducts } from "../src/lib/matching/productMatcher.js";

const isDeeplyFrozen = (value) => (
  value === null
  || typeof value !== "object"
  || (Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen))
);

const completeAmazonScProfile = () => ({
  entityRegion: "mainland",
  entityType: "limited_company",
  businessModels: ["amazon_sc"],
  primaryPlatformOrBuyerName: "Amazon",
  platformHistoryMonths: 13,
  singleStoreGmv: { amount: 6000000, currency: "USD" },
  qualifiedStoreCount: 1,
  acceptsAccountControl: true,
  hasCompatibleCollectionAccount: false,
  preferredCurrency: "usd",
  requestedAmount: { amount: 2000000, currency: "USD" },
  preferredTermMonths: 3,
  fundUse: "inventory_procurement",
  preferredRepaymentMethod: "revolving",
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
  assert.ok(matches.every((match) => match.status === "needs_information"));
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

test("matcher persists detached estimator provenance and a product rule version", () => {
  const profile = completeAmazonScProfile();
  const match = matchProducts(profile).find((item) => item.productId === "linklogis-amazon-sc");

  profile.qualifiedStoreCount = 9;

  assert.deepEqual(match.estimatedAmount, {
    kind: "range", currency: "USD", min: 0, max: 3000000,
    formulaKey: "linklogis_sc_v1", note: "单店最高300万美元，最终额度以机构评估为准。",
  });
  assert.equal(match.ruleVersion, "2026-08-24");
  assert.deepEqual(match.inputSnapshot, { qualifiedStoreCount: 1 });
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

test("fit dimensions compare requested scale, purpose, repayment, currency, term, and controls", () => {
  const shared = {
    ...completeAmazonScProfile(),
    hasCompatibleCollectionAccount: false,
    requestedAmount: { amount: 3000000, currency: "USD" },
    fundUse: "inventory_procurement",
    preferredRepaymentMethod: "revolving",
  };
  const aligned = matchProducts(shared).find((item) => item.productId === "linklogis-amazon-sc");
  const misaligned = matchProducts({
    ...shared,
    businessModels: ["platform_ecommerce"],
    requestedAmount: { amount: 3000001, currency: "USD" },
    preferredCurrency: "rmb",
    preferredTermMonths: 4,
    fundUse: "receivables_turnover",
    preferredRepaymentMethod: "equal_installments",
  }).find((item) => item.productId === "linklogis-amazon-sc");

  assert.deepEqual(Object.keys(aligned.fitDimensions).sort(), [
    "businessModel",
    "cashFlow",
    "controlAcceptance",
    "currencyTermUse",
    "documentation",
    "scaleAndLimit",
  ]);
  for (const dimension of Object.values(aligned.fitDimensions)) {
    assert.ok(dimension >= 0 && dimension <= 100);
  }
  assert.ok(aligned.fitDimensions.businessModel > misaligned.fitDimensions.businessModel);
  assert.ok(aligned.fitDimensions.scaleAndLimit > misaligned.fitDimensions.scaleAndLimit);
  assert.ok(aligned.fitDimensions.cashFlow > misaligned.fitDimensions.cashFlow);
  assert.ok(aligned.fitDimensions.currencyTermUse > misaligned.fitDimensions.currencyTermUse);
  assert.ok(aligned.fitScore > misaligned.fitScore);
});

test("non-applicable fit dimensions are neutral rather than scored as failures", () => {
  const cmb = matchProducts({}).find((item) => item.productId === "cmb-guangdong-business-loan");

  assert.equal(cmb.fitDimensions.businessModel, 50);
  assert.equal(cmb.fitDimensions.controlAcceptance, 50);
});

test("catalog fit boundaries can change ordering between fully eligible SC and VC products", () => {
  const profile = {
    entityRegion: "mainland",
    entityType: "limited_company",
    businessModels: ["amazon_sc", "amazon_vc"],
    primaryPlatformOrBuyerName: "Amazon",
    platformSites: ["united_states"],
    platformHistoryMonths: 13,
    singleStoreGmv: { amount: 6000000, currency: "USD" },
    amazonAnnualGmv: { amount: 3000000, currency: "USD" },
    accountsReceivableBalance: { amount: 1000000, currency: "USD" },
    qualifiedStoreCount: 1,
    acceptsAccountControl: true,
    hasCompatibleCollectionAccount: false,
    acceptsNoa: true,
    acceptsReceivablesAssignment: true,
    preferredCurrency: "usd",
    requestedAmount: { amount: 2000000, currency: "USD" },
  };
  const scLed = matchProducts({
    ...profile,
    preferredTermMonths: 3,
    fundUse: "inventory_procurement",
    preferredRepaymentMethod: "revolving",
  }).filter(({ rank }) => rank != null);
  const vcLed = matchProducts({
    ...profile,
    preferredTermMonths: 3,
    fundUse: "receivables_turnover",
    preferredRepaymentMethod: "receivables_collection",
  }).filter(({ rank }) => rank != null);

  assert.equal(scLed[0].productId, "linklogis-amazon-sc");
  assert.equal(vcLed[0].productId, "linklogis-amazon-vc");
});

test("amount provenance snapshots contain estimator inputs only", () => {
  const profile = {
    ...completeAmazonScProfile(),
    companyName: "must not be copied seven times",
    annualRevenue: { amount: 40000000, currency: "RMB" },
    taxInvoiceAmount: { amount: 3000000, currency: "RMB" },
    collectionsLast12Months: { amount: 12000000, currency: "RMB" },
    industry: "加工制造",
  };
  const matches = matchProducts(profile);
  const sc = matches.find((item) => item.productId === "linklogis-amazon-sc");
  const logistics = matches.find((item) => item.productId === "pingan-foreign-trade-logistics-loan");

  assert.deepEqual(sc.inputSnapshot, { qualifiedStoreCount: 1 });
  assert.deepEqual(logistics.inputSnapshot, {
    annualRevenue: { amount: 40000000, currency: "RMB" },
    industry: "加工制造",
    taxInvoiceAmount: { amount: 3000000, currency: "RMB" },
  });
  assert.ok(matches.every((match) => !Object.hasOwn(match.inputSnapshot, "companyName")));
});

test("golden profiles name at least 20 explicit outcomes and cover every product", () => {
  assert.ok(GOLDEN_PROFILES.length >= 20);
  assert.ok(isDeeplyFrozen(GOLDEN_PROFILES), "golden fixtures must be recursively frozen");
  assert.equal(new Set(GOLDEN_PROFILES.map(({ name }) => name)).size, GOLDEN_PROFILES.length);
  assert.deepEqual(
    [...new Set(GOLDEN_PROFILES.map(({ expectedPrimary }) => expectedPrimary).filter(Boolean))].sort(),
    [...PRODUCT_IDS].sort(),
  );
  assert.ok(GOLDEN_PROFILES.some(({ expectedPrimary }) => expectedPrimary === null));

  const allHardFailure = GOLDEN_PROFILES.find(({ name }) => name === "all-products-explicit-hard-failure");
  assert.ok(allHardFailure, "an explicit all-product hard-failure fixture is required");
  assert.deepEqual(
    matchProducts(allHardFailure.profile)
      .filter(({ status }) => status === "ineligible")
      .map(({ productId }) => productId)
      .sort(),
    [...PRODUCT_IDS].sort(),
  );
});

for (const { name, profile, expectedPrimary, expectedRankedPrefix } of GOLDEN_PROFILES) {
  test(`golden profile: ${name}`, () => {
    const beforeMatch = structuredClone(profile);
    const first = matchProducts(profile);
    const second = matchProducts(profile);
    const ranked = first.filter(({ rank }) => rank != null);

    assert.deepEqual(first, second, "matcher output must be deterministic");
    assert.deepEqual(profile, beforeMatch, "matcher must not mutate golden profile input");
    assert.ok(ranked.length <= 3, "customer output may rank at most three products");
    assert.ok(ranked.every(({ status }) => status !== "ineligible"), "hard failures must not be recommended");
    assert.equal(ranked[0]?.productId ?? null, expectedPrimary);
    if (expectedRankedPrefix) {
      assert.deepEqual(
        ranked.slice(0, expectedRankedPrefix.length).map(({ productId }) => productId),
        expectedRankedPrefix,
      );
    }
  });
}

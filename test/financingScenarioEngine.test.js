import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFinancingScenarioInput,
  SCENARIO_POLICY_VERSION,
} from "../src/lib/matching/financingScenarioEngine.js";
import { getProductById } from "../src/lib/matching/productCatalog.js";

test("WeBank scenarios stay inside monthly collections and catalog cap", () => {
  const result = buildFinancingScenarioInput({
    profile: {
      collectionsLast12Months: { amount: 12000000, currency: "RMB" },
      requestedAmount: { amount: 4000000, currency: "RMB" },
    },
    productMatches: [{ productId: "webank-cross-border-data-loan", rank: 1, status: "eligible" }],
  });
  const product = result.products[0];
  assert.deepEqual(product.amountScenarios.map(({ scenarioCode }) => scenarioCode), [
    "conservative", "balanced", "growth",
  ]);
  assert.equal(Math.max(...product.amountScenarios.map(({ maximum }) => maximum)), 3500000);
  assert.deepEqual(product.termOptions, ["webank_4_plus_5", "webank_3_plus_6"]);
});

test("Amazon SC scenarios never exceed demand or qualified-store cap", () => {
  const result = buildFinancingScenarioInput({
    profile: {
      qualifiedStoreCount: 1,
      requestedAmount: { amount: 2000000, currency: "USD" },
      singleStoreGmv: { amount: 6500000, currency: "USD" },
      platformHistoryMonths: 18,
    },
    productMatches: [{ productId: "linklogis-amazon-sc", rank: 1, status: "eligible" }],
  });
  assert.equal(Math.max(...result.products[0].amountScenarios.map(({ maximum }) => maximum)), 2000000);
  assert.deepEqual(result.products[0].termOptions, ["sc_90_days", "sc_revolving"]);
});

test("products without a verified formula return no numeric scenarios", () => {
  const result = buildFinancingScenarioInput({
    profile: {},
    productMatches: [{ productId: "cmb-guangdong-business-loan", rank: 1, status: "needs_information" }],
  });
  assert.deepEqual(result.products[0].amountScenarios, []);
  assert.equal(result.products[0].quantificationStatus, "formula_unavailable");
});

test("products without a published amount formula are explicitly formula unavailable", () => {
  const productIds = [
    "cmb-guangdong-business-loan",
    "pingan-orange-tax-loan",
    "linklogis-amazon-vc",
    "linklogis-b2b-factoring",
  ];

  for (const productId of productIds) {
    const result = buildFinancingScenarioInput({
      productMatches: [{ productId, rank: 1, status: "eligible" }],
    });
    assert.equal(result.products[0].quantificationStatus, "formula_unavailable");
    assert.deepEqual(result.products[0].amountScenarios, []);
  }
});

test("Ping An logistics emits one balanced scenario only when its formula is exact", () => {
  const result = buildFinancingScenarioInput({
    profile: {
      industry: "processing_manufacturing",
      annualRevenue: { amount: 40000000, currency: "RMB" },
      taxInvoiceAmount: { amount: 3000000, currency: "RMB" },
    },
    productMatches: [{ productId: "pingan-foreign-trade-logistics-loan", rank: 1, status: "eligible" }],
  });

  assert.deepEqual(result.products[0].amountScenarios, [{
    scenarioCode: "balanced",
    currency: "RMB",
    minimum: 5000000,
    maximum: 5000000,
    assumptionCodes: ["verified-logistics-formula"],
  }]);
  assert.deepEqual(result.products[0].termOptions, ["up_to_36_months"]);
  assert.equal(result.products[0].quantificationStatus, "quantified");
});

test("engine preserves catalog-owned metadata and excludes unranked or ineligible products", () => {
  const result = buildFinancingScenarioInput({
    profile: {},
    productMatches: [
      { productId: "linklogis-amazon-vc", rank: 2, status: "needs_information" },
      { productId: "pingan-orange-tax-loan", rank: 4, status: "eligible" },
      { productId: "linklogis-b2b-factoring", rank: 1, status: "ineligible" },
    ],
  });

  assert.equal(result.policyVersion, SCENARIO_POLICY_VERSION);
  assert.deepEqual(result.products.map(({ productId }) => productId), ["linklogis-amazon-vc"]);
  assert.deepEqual(result.products[0], {
    productId: "linklogis-amazon-vc",
    rank: 2,
    eligibilityStatus: "needs_information",
    quantificationStatus: "formula_unavailable",
    amountScenarios: [],
    termOptions: ["up_to_120_days"],
    pricingReference: { annualizedRate: { minimum: "8%", maximum: "10%" } },
    missingEvidenceCodes: [],
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.products[0]), true);
  assert.equal(Object.isFrozen(result.products[0].termOptions), true);
});

test("engine accepts at most three uniquely ranked, uniquely identified candidates", () => {
  const result = buildFinancingScenarioInput({
    productMatches: [
      { productId: "webank-cross-border-data-loan", rank: 1, status: "eligible" },
      { productId: "linklogis-amazon-sc", rank: 1, status: "eligible" },
      { productId: "webank-cross-border-data-loan", rank: 2, status: "eligible" },
      { productId: "pingan-foreign-trade-logistics-loan", rank: 1, status: "eligible" },
      { productId: "linklogis-amazon-vc", rank: 1, status: "eligible" },
      { productId: "linklogis-b2b-factoring", rank: 3, status: "eligible" },
    ],
  });

  assert.deepEqual(result.products.map(({ productId, rank }) => ({ productId, rank })), [
    { productId: "linklogis-amazon-sc", rank: 1 },
    { productId: "webank-cross-border-data-loan", rank: 2 },
    { productId: "linklogis-b2b-factoring", rank: 3 },
  ]);
});

test("engine accepts only server matcher statuses and sanitized matcher evidence codes", () => {
  const result = buildFinancingScenarioInput({
    productMatches: [
      {
        productId: "linklogis-amazon-sc",
        rank: 1,
        status: "eligible",
        missingFields: [
          "platformHistoryMonths",
          "platformHistoryMonths",
          "not-a-matcher-field",
          " ",
          { code: "platformHistoryMonths" },
          "x".repeat(129),
        ],
      },
      { productId: "webank-cross-border-data-loan", rank: 2, status: "ineligible" },
      { productId: "linklogis-amazon-vc", rank: 3, status: "approved" },
    ],
  });

  assert.deepEqual(result.products.map(({ productId }) => productId), ["linklogis-amazon-sc"]);
  assert.deepEqual(result.products[0].missingEvidenceCodes, ["platformHistoryMonths", "qualified-store-count", "requested-amount"]);
});

test("engine ignores null and primitive product matches", () => {
  const result = buildFinancingScenarioInput({
    productMatches: [null, undefined, false, 7, "not-a-match", { productId: "linklogis-amazon-vc", rank: 1, status: "eligible" }],
  });

  assert.deepEqual(result.products.map(({ productId }) => productId), ["linklogis-amazon-vc"]);
});

test("engine clones pricing references before freezing its result", () => {
  const result = buildFinancingScenarioInput({
    productMatches: [{ productId: "linklogis-amazon-sc", rank: 1, status: "eligible" }],
  });
  const sourcePricing = getProductById("linklogis-amazon-sc").pricing;

  assert.notEqual(result.products[0].pricingReference, sourcePricing);
  assert.deepEqual(result.products[0].pricingReference, sourcePricing);
  assert.equal(Object.isFrozen(result.products[0].pricingReference), true);
});

test("engine omits scenarios when required numeric evidence is absent or invalid", () => {
  const result = buildFinancingScenarioInput({
    profile: {
      collectionsLast12Months: { amount: Number.POSITIVE_INFINITY, currency: "RMB" },
      requestedAmount: { amount: 0, currency: "RMB" },
    },
    productMatches: [{ productId: "webank-cross-border-data-loan", rank: 1, status: "eligible" }],
  });

  assert.deepEqual(result.products[0].amountScenarios, []);
  assert.equal(result.products[0].quantificationStatus, "needs_evidence");
});

test("materially incomplete candidates expose only conservative supported amounts", () => {
  const incompleteSc = buildFinancingScenarioInput({
    profile: {
      qualifiedStoreCount: 1,
      requestedAmount: { amount: 2000000, currency: "USD" },
      singleStoreGmv: { amount: 6500000, currency: "USD" },
      platformHistoryMonths: 18,
    },
    productMatches: [{ productId: "linklogis-amazon-sc", rank: 1, status: "needs_information" }],
  });
  const incompleteLogistics = buildFinancingScenarioInput({
    profile: {
      industry: "processing_manufacturing",
      annualRevenue: { amount: 40000000, currency: "RMB" },
      taxInvoiceAmount: { amount: 3000000, currency: "RMB" },
    },
    productMatches: [{ productId: "pingan-foreign-trade-logistics-loan", rank: 1, status: "needs_information" }],
  });

  assert.deepEqual(incompleteSc.products[0].amountScenarios.map(({ scenarioCode }) => scenarioCode), ["conservative"]);
  assert.equal(incompleteSc.products[0].quantificationStatus, "quantified");
  assert.deepEqual(incompleteLogistics.products[0].amountScenarios, []);
  assert.equal(incompleteLogistics.products[0].quantificationStatus, "needs_evidence");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFinancingScenarioInput,
  SCENARIO_POLICY_VERSION,
} from "../src/lib/matching/financingScenarioEngine.js";

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
  assert.equal(result.products[0].quantificationStatus, "needs_evidence");
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
    quantificationStatus: "needs_evidence",
    amountScenarios: [],
    termOptions: ["up_to_120_days"],
    pricingReference: { annualizedRate: { minimum: "8%", maximum: "10%" } },
    missingEvidenceCodes: [],
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.products[0]), true);
  assert.equal(Object.isFrozen(result.products[0].termOptions), true);
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

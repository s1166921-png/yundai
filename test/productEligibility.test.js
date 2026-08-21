import test from "node:test";
import assert from "node:assert/strict";
import { getProductById } from "../src/lib/matching/productCatalog.js";
import { evaluateEligibility, evaluateRule } from "../src/lib/matching/ruleEvaluator.js";

const rule = (productId, ruleId) => getProductById(productId).ruleSet.find((item) => item.id === ruleId);

const amazonScProfile = (gmv) => ({
  entityRegion: "mainland",
  primaryPlatformOrBuyerName: "Amazon",
  singleStoreGmv: { amount: gmv, currency: "USD" },
  platformHistoryMonths: 13,
  acceptsAccountControl: true,
});

test("Amazon SC uses the USD money amount and strict GMV boundary", () => {
  const product = getProductById("linklogis-amazon-sc");

  assert.equal(evaluateEligibility(product, amazonScProfile(5000000)).status, "ineligible");
  assert.equal(evaluateEligibility(product, amazonScProfile(5000001)).status, "eligible");
});

test("Amazon VC requires more than six history months with a US site and eligible entity", () => {
  const product = getProductById("linklogis-amazon-vc");
  const profile = (platformHistoryMonths) => ({
    entityRegion: "mainland",
    businessModels: ["amazon_vc"],
    platformSites: ["united_states"],
    singleStoreGmv: { amount: 2000001, currency: "USD" },
    platformHistoryMonths,
    acceptsNoa: true,
    acceptsAccountControl: true,
  });

  assert.equal(evaluateEligibility(product, profile(6)).status, "ineligible");
  assert.equal(evaluateEligibility(product, profile(7)).status, "eligible");
});

test("B2B factoring uses the USD annual-trade amount and strict boundary", () => {
  const product = getProductById("linklogis-b2b-factoring");
  const profile = (amount) => ({
    entityRegion: "other_overseas",
    buyerTradingHistoryMonths: 13,
    annualB2bTrade: { amount, currency: "USD" },
    buyerCountry: "已列明准入国家",
    acceptsAccountControl: true,
  });

  assert.equal(evaluateEligibility(product, profile(2400000)).status, "ineligible");
  assert.equal(evaluateEligibility(product, profile(2400001)).status, "eligible");
});

test("WeBank applies AHR, percentage-point refund, and US-site boundaries", () => {
  const product = getProductById("webank-cross-border-data-loan");
  const profile = ({ ahr = 201, refund = 40, sites = ["united_states"] } = {}) => ({
    primaryPlatformOrBuyerName: "Amazon",
    entityRegion: "mainland",
    companyAgeMonths: 6,
    legalRepresentativeAge: 23,
    hasCurrentOverdue: false,
    hasMajorLitigation: false,
    platformHistoryMonths: 24,
    storeCount: 2,
    allStoreSales: { amount: 2000000, currency: "RMB" },
    allStoreRepayments: { amount: 500000, currency: "RMB" },
    refundRatePercent: refund,
    amazonAccountStatus: "normal",
    amazonAhrScore: ahr,
    platformSites: sites,
    fbaInventoryTurnoverCount: 3,
    borrowerMatchesCollectionEntity: true,
    acceptsAccountControl: true,
    raw: { participatingStoreOperatingDays: 180 },
  });

  assert.equal(evaluateEligibility(product, profile({ ahr: 200 })).status, "ineligible");
  assert.equal(evaluateEligibility(product, profile({ refund: 40 })).status, "eligible");
  assert.equal(evaluateEligibility(product, profile({ refund: 40.01 })).status, "ineligible");
  assert.equal(evaluateEligibility(product, profile({ sites: ["other"] })).status, "ineligible");
});

test("Ping An logistics accepts its inclusive USD import-export minimum", () => {
  const importExportRule = rule("pingan-foreign-trade-logistics-loan", "import-export-volume-last-12-months");

  assert.equal(evaluateRule(importExportRule, {
    importExportAmountLast12Months: { amount: 500000, currency: "USD" },
  }).status, "passed");
  assert.equal(evaluateRule(importExportRule, {
    importExportAmountLast12Months: { amount: 499999, currency: "USD" },
  }).status, "failed");
});

test("CMB retains inclusive RMB revenue and maximum-four-bank boundaries", () => {
  const revenueRule = rule("cmb-guangdong-business-loan", "annual-revenue-minimum");
  const bankRule = rule("cmb-guangdong-business-loan", "credit-bank-count-maximum");

  assert.equal(evaluateRule(revenueRule, { annualRevenue: { amount: 10000000, currency: "RMB" } }).status, "passed");
  assert.equal(evaluateRule(bankRule, { creditBankCount: 5 }).status, "failed");
});

test("Ping An Orange accepts 24 company months and rejects applicant age 66", () => {
  const product = getProductById("pingan-orange-tax-loan");
  const profile = (legalRepresentativeAge) => ({
    companyAgeMonths: 24,
    legalRepresentativeAge,
  });

  assert.equal(evaluateRule(rule("pingan-orange-tax-loan", "company-registration-two-years"), profile(25)).status, "passed");
  assert.equal(evaluateEligibility(product, profile(66)).status, "ineligible");
});

test("catalog rules use canonical field paths and percentage-point thresholds", () => {
  assert.equal(rule("linklogis-amazon-sc", "single-store-annual-gmv").field, "singleStoreGmv.amount");
  assert.equal(rule("linklogis-b2b-factoring", "annual-trading-volume").field, "annualB2bTrade.amount");
  assert.equal(rule("webank-cross-border-data-loan", "refund-rate-last-three-months").value, 40);
  assert.equal(rule("pingan-foreign-trade-logistics-loan", "import-export-revenue-share").value, 50);
});

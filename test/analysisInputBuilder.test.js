import test from "node:test";
import assert from "node:assert/strict";
import { buildAiAnalysisInput } from "../src/lib/ai/analysisInputBuilder.js";

test("analysis input contains business buckets and excludes direct identifiers and free text", () => {
  const input = buildAiAnalysisInput({
    profile: {
      companyName: "不可发送企业有限公司",
      contactName: "不可发送联系人",
      phone: "13800000000",
      buyerName: "不可发送买家名称",
      primaryBusinessModel: "amazon_sc",
      entityRegion: "mainland",
      companyAgeMonths: 18,
      platformHistoryMonths: 20,
      singleStoreGmv: { amount: 6200000, currency: "USD" },
      requestedAmount: { amount: 1000000, currency: "USD" },
      fundUse: "inventory_procurement",
      acceptsAccountControl: true,
    },
    productMatches: [{
      productId: "linklogis-amazon-sc",
      rank: 1,
      status: "eligible",
      passedRules: [{
        id: "single-store-annual-gmv",
        status: "passed",
        message: "伪造文本应被忽略",
      }],
      unknownRules: [{
        id: "collection-account-arrangement",
        status: "unknown",
        message: "伪造文本应被忽略",
      }],
    }],
    matchReport: {
      primary: { productId: "linklogis-amazon-sc" },
      alternatives: [],
      missingDocuments: ["近 12 个月销售数据证明"],
    },
  });
  const serialized = JSON.stringify(input);
  for (const forbidden of ["不可发送企业", "不可发送联系人", "13800000000", "不可发送买家"]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }
  assert.deepEqual(input, {
    schemaVersion: "meiou-analysis-v1",
    scenario: "amazon_sc",
    facts: {
      entityRegion: "mainland",
      companyAgeBand: "12-24_months",
      platformHistoryBand: "12-24_months",
      singleStoreGmvBand: "5m-10m_USD",
      requestedAmountBand: "1m-3m_USD",
      fundUse: "inventory_procurement",
      acceptsAccountControl: true,
    },
    products: [{
      productId: "linklogis-amazon-sc",
      status: "eligible",
      satisfiedConditions: ["Amazon 单店铺年 GMV 需大于 500 万美元。"],
      itemsToConfirm: ["需接受将回款账户切换至合作支付公司或银行；已有兼容账户可免切换。"],
    }],
    preparationDocuments: ["近 12 个月销售数据证明"],
  });
});

test("analysis input recursively rejects identity and internal evidence keys", () => {
  const forbiddenKeys = new Set([
    "companyName", "contactName", "phone", "buyerName", "primaryPlatformOrBuyerName",
    "id", "raw", "internalReason", "failedRules", "fitScore", "confidence", "ruleVersion",
  ]);
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      assert.equal(forbiddenKeys.has(key), false, `forbidden key: ${key}`);
      visit(nested);
    }
  };
  visit(buildAiAnalysisInput({ profile: {}, productMatches: [], matchReport: {} }));
});

test("analysis input uses lower-inclusive and upper-exclusive month and money bands", () => {
  const atBoundary = (profile) => buildAiAnalysisInput({ profile }).facts;

  assert.equal(atBoundary({ companyAgeMonths: 0 }).companyAgeBand, "under_6_months");
  assert.equal(atBoundary({ companyAgeMonths: 6 }).companyAgeBand, "6-12_months");
  assert.equal(atBoundary({ companyAgeMonths: 12 }).companyAgeBand, "12-24_months");
  assert.equal(atBoundary({ companyAgeMonths: 24 }).companyAgeBand, "24-60_months");
  assert.equal(atBoundary({ companyAgeMonths: 60 }).companyAgeBand, "60_plus_months");

  assert.equal(atBoundary({ singleStoreGmv: { amount: 0, currency: "USD" } }).singleStoreGmvBand, "under_500k_USD");
  assert.equal(atBoundary({ singleStoreGmv: { amount: 500000, currency: "USD" } }).singleStoreGmvBand, "500k-1m_USD");
  assert.equal(atBoundary({ singleStoreGmv: { amount: 1000000, currency: "USD" } }).singleStoreGmvBand, "1m-3m_USD");
  assert.equal(atBoundary({ singleStoreGmv: { amount: 5000000, currency: "USD" } }).singleStoreGmvBand, "5m-10m_USD");
  assert.equal(atBoundary({ singleStoreGmv: { amount: 10000000, currency: "USD" } }).singleStoreGmvBand, "10m_plus_USD");
  assert.equal(atBoundary({ requestedAmount: { amount: 1000000, currency: "RMB" } }).requestedAmountBand, "1m-3m_RMB");
  assert.equal(atBoundary({ requestedAmount: { amount: 100000000, currency: "RMB" } }).requestedAmountBand, "100m_plus_RMB");
  assert.equal(atBoundary({ requestedAmount: { amount: 1000000, currency: "EUR" } }).requestedAmountBand, undefined);
});

test("analysis input caps ranked products and keeps only safe evidence", () => {
  const input = buildAiAnalysisInput({
    productMatches: [
      {
        productId: "linklogis-amazon-vc",
        rank: 4,
        status: "eligible",
        passedRules: [{ id: "amazon-vc-entity", status: "passed", message: "ignored" }],
      },
      {
        productId: "linklogis-amazon-sc",
        rank: 2,
        status: "eligible",
        passedRules: [
          { id: "single-store-annual-gmv", status: "passed", message: "ignored" },
          { id: "single-store-annual-gmv", status: "passed", message: "ignored", internalReason: "do not copy" },
        ],
        unknownRules: [
          { id: "collection-account-arrangement", status: "unknown", message: "ignored" },
          { id: "collection-account-arrangement", status: "unknown", message: "ignored" },
        ],
        failedRules: [{ message: "failed" }],
        fitScore: 100,
        confidence: 100,
        ruleVersion: "secret",
      },
      {
        productId: "linklogis-b2b-factoring",
        rank: 1,
        status: "needs_information",
        passedRules: [{ id: "buyer-trading-history", status: "passed", message: "ignored" }],
      },
      {
        productId: "webank-cross-border-data-loan",
        rank: 3,
        status: "eligible",
        passedRules: [{ id: "domestic-registration", status: "passed", message: "ignored" }],
      },
    ],
    matchReport: {
      missingDocuments: ["近 12 个月销售数据证明", "不可发送的任意字符串", "近 12 个月销售数据证明"],
    },
  });

  assert.deepEqual(input.products, [
    {
      productId: "linklogis-b2b-factoring",
      status: "needs_information",
      satisfiedConditions: ["与买方交易历史需超过 12 个月。"],
      itemsToConfirm: [],
    },
    {
      productId: "linklogis-amazon-sc",
      status: "eligible",
      satisfiedConditions: ["Amazon 单店铺年 GMV 需大于 500 万美元。"],
      itemsToConfirm: ["需接受将回款账户切换至合作支付公司或银行；已有兼容账户可免切换。"],
    },
    {
      productId: "webank-cross-border-data-loan",
      status: "eligible",
      satisfiedConditions: ["企业需在境内注册。"],
      itemsToConfirm: [],
    },
  ]);
  assert.deepEqual(input.preparationDocuments, ["近 12 个月销售数据证明"]);
  assert.doesNotMatch(JSON.stringify(input), /failed|internal|secret|不可发送|ignored/);
});

test("analysis input derives rule messages from own catalog identity and status", () => {
  const inheritedRule = Object.create({ message: "inherited secret" });
  inheritedRule.id = "single-store-annual-gmv";
  inheritedRule.status = "passed";

  const input = buildAiAnalysisInput({
    productMatches: [{
      productId: "linklogis-amazon-sc",
      rank: 1,
      status: "eligible",
      passedRules: [
        inheritedRule,
        { id: "single-store-annual-gmv", status: "passed", message: "own secret" },
        { id: "unknown-rule", status: "passed", message: "unknown secret" },
        { id: "collection-account-arrangement", status: "unknown", message: "wrong status" },
      ],
      unknownRules: [{ id: "collection-account-arrangement", status: "unknown", message: "injected secret" }],
    }],
  });

  assert.deepEqual(input.products, [{
    productId: "linklogis-amazon-sc",
    status: "eligible",
    satisfiedConditions: ["Amazon 单店铺年 GMV 需大于 500 万美元。"],
    itemsToConfirm: ["需接受将回款账户切换至合作支付公司或银行；已有兼容账户可免切换。"],
  }]);
  assert.doesNotMatch(JSON.stringify(input), /inherited secret|own secret|unknown secret|wrong status|injected secret/);
});

test("analysis input rejects invalid, colliding, duplicate, and ineligible ranks", () => {
  const valid = (productId, rank, status = "eligible") => ({
    productId,
    rank,
    status,
    passedRules: [],
    unknownRules: [],
  });
  const input = buildAiAnalysisInput({
    productMatches: [
      valid("linklogis-amazon-sc", 1),
      valid("linklogis-amazon-vc", 1),
      valid("linklogis-b2b-factoring", 2),
      valid("webank-cross-border-data-loan", 2),
      valid("linklogis-amazon-vc", 3),
      valid("linklogis-amazon-vc", 3),
      valid("webank-cross-border-data-loan", 0),
      valid("linklogis-amazon-sc", -1),
      valid("linklogis-amazon-vc", 1.5),
      valid("linklogis-b2b-factoring", 4),
      valid("webank-cross-border-data-loan", 3, "ineligible"),
    ],
  });

  assert.deepEqual(input.products, []);
});

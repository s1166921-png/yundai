import test from "node:test";
import assert from "node:assert/strict";
import { buildCustomerMatchReport } from "../src/lib/matching/reportBuilder.js";
import { buildCustomerMatchReport as buildProductReport } from "../src/lib/aiInsight.js";

const profileFixture = {
  entityRegion: "mainland",
  entityType: "limited_company",
  primaryPlatformOrBuyerName: "Amazon",
  platformHistoryMonths: 13,
  singleStoreGmv: { amount: 6000000, currency: "USD" },
  acceptsAccountControl: true,
};

const matchFixture = [
  {
    productId: "linklogis-amazon-sc",
    status: "eligible",
    rank: 1,
    fitScore: 100,
    confidence: 100,
    passedRules: [
      { id: "amazon-store", field: "primaryPlatformOrBuyerName", message: "需为 Amazon 店铺收款主体。" },
    ],
    failedRules: [],
    missingFields: [],
    estimatedAmount: { kind: "range", currency: "USD", min: 0, max: 3000000, formulaKey: "internal_formula", note: "单店最高300万美元，最终额度以机构评估为准。" },
    ruleVersion: "2026-08-21",
  },
  {
    productId: "pingan-orange-tax-loan",
    status: "ineligible",
    rank: null,
    fitScore: 1,
    confidence: 1,
    passedRules: [],
    failedRules: [{ message: "一票否决：内部风险标签", internalReason: "内部风险标签" }],
    missingFields: [],
    estimatedAmount: { kind: "range", currency: "RMB", min: 50001, max: 3000000, formulaKey: "internal_formula", note: "资料未提供税金到额度的精确核额公式。" },
    ruleVersion: "2026-08-21",
  },
];

test("customer report excludes internal scores and hard-failure labels", () => {
  const report = buildCustomerMatchReport(profileFixture, matchFixture);
  const serialized = JSON.stringify(report);

  assert.doesNotMatch(serialized, /fitScore|confidence|failedRules|一票否决|内部风险标签|internal_formula/);
  assert.ok(report.alternatives.length <= 2);
  assert.deepEqual(report.nonMatches, [{
    institution: "平安银行",
    name: "平安银行橙业贷税金方案",
    reason: "当前资料暂未满足该产品的部分基础准入要求。",
  }]);
});

test("progressive reports omit advisor-only missing documents", () => {
  const report = buildCustomerMatchReport({ intakeVersion: "progressive-v1" }, [{
    productId: "cmb-guangdong-business-loan",
    status: "needs_information",
    rank: 1,
    confidence: 50,
    passedRules: [],
    failedRules: [],
    missingFields: ["companyCreditRating", "platformHistoryMonths"],
    estimatedAmount: null,
  }]);

  assert.deepEqual(report.missingDocuments, ["平台交易历史证明"]);
});

test("progressive reports use product-direction labels and the verification disclaimer", () => {
  const report = buildCustomerMatchReport({ intakeVersion: "progressive-v1" }, [{
    ...matchFixture[0],
    status: "eligible",
    rank: 1,
    confidence: 100,
  }, {
    ...matchFixture[0],
    productId: "linklogis-amazon-vc",
    status: "needs_information",
    rank: 2,
    confidence: 50,
  }, {
    ...matchFixture[1],
    presentationLabel: "internal",
  }]);

  assert.equal(report.primary.presentationLabel, "优先产品方向");
  assert.equal(report.alternatives[0].presentationLabel, "待补关键信息");
  assert.equal(report.nonMatches[0].presentationLabel, "暂不匹配");
  assert.equal(report.disclaimer, "仍需资金方及融资顾问核验完整资料，本结果不构成授信或放款承诺。");
});

test("progressive report suppresses estimator output until its required inputs are usable", () => {
  const report = buildCustomerMatchReport({ intakeVersion: "progressive-v1" }, [{
    ...matchFixture[0],
    inputSnapshot: {},
    estimatedAmount: { kind: "manual", currency: "USD", min: null, max: null, note: "需补充符合条件的店铺数量。" },
  }]);

  assert.equal(report.primary.estimatedAmount, null);
});

test("missing documents use the fixed field map, deduplicate, and stop at five", () => {
  const report = buildCustomerMatchReport(profileFixture, [{
    ...matchFixture[0],
    status: "needs_information",
    missingFields: [
      "singleStoreGmv.amount",
      "platformHistoryMonths",
      "singleStoreGmv.amount",
      "allStoreRepayments.amount",
      "annualRevenue.amount",
      "acceptsAccountControl",
      "participatingStoreOperatingDays",
    ],
  }]);

  assert.deepEqual(report.missingDocuments, [
    "平台经营数据证明",
    "平台交易历史证明",
    "近 12 个月回款记录",
    "近一年财务报表或纳税申报摘要",
    "回款账户安排确认",
  ]);
});

test("missing-document map covers canonical and percentage rule fields", () => {
  const report = buildCustomerMatchReport(profileFixture, [{
    ...matchFixture[0],
    status: "needs_information",
    missingFields: ["applicantRole", "importExportRevenueSharePercent"],
  }]);

  assert.deepEqual(report.missingDocuments, [
    "申请人身份说明",
    "进出口业务营收占比说明",
  ]);
});

test("report copies customer product facts from the versioned catalog", () => {
  const report = buildCustomerMatchReport(profileFixture, matchFixture);

  assert.deepEqual(report.primary, {
    institution: "联易融",
    name: "联易融 Amazon SC 卖家融资贷",
    currency: "USD",
    pricing: "年化9%-11%",
    term: "90天或随借随还",
    limit: "单店最高300万美元，可循环",
    presentationLabel: "优先匹配",
    estimatedAmount: {
      kind: "range",
      currency: "USD",
      min: 0,
      max: 3000000,
      note: "单店最高300万美元，最终额度以机构评估为准。",
    },
    whyMatched: ["需为 Amazon 店铺。"],
    itemsToConfirm: [],
  });
  assert.equal(report.disclaimer, "仍需资金方及融资顾问核验完整资料，本结果不构成授信或放款承诺。");
  assert.equal(report.ruleVersion, undefined);
  assert.deepEqual(buildProductReport(profileFixture, matchFixture), report);
});

test("report selects only ranks one through three and caps alternatives at two", () => {
  const report = buildCustomerMatchReport(profileFixture, [
    matchFixture[0],
    { ...matchFixture[0], productId: "linklogis-amazon-vc", rank: 2, status: "needs_information" },
    { ...matchFixture[0], productId: "linklogis-b2b-factoring", rank: 3 },
    { ...matchFixture[0], productId: "pingan-orange-tax-loan", rank: 4 },
  ]);

  assert.equal(report.primary.name, "联易融 Amazon SC 卖家融资贷");
  assert.deepEqual(report.alternatives.map((product) => product.name), [
    "联易融 Amazon VC 发货后融资贷",
    "联易融 B2B 保理融资",
  ]);
});

test("report does not promote ineligible products when no ranked result exists", () => {
  const report = buildCustomerMatchReport(profileFixture, [{
    ...matchFixture[0],
    status: "ineligible",
    rank: null,
    failedRules: [{ message: "一票否决：不得暴露" }],
  }]);

  assert.equal(report.primary, null);
  assert.deepEqual(report.alternatives, []);
  assert.equal(report.summary, "当前资料中暂无可展示的推荐产品，请补充相关资料后再评估。");
  assert.deepEqual(report.nonMatches, [{
    institution: "联易融",
    name: "联易融 Amazon SC 卖家融资贷",
    reason: "当前资料暂未满足该产品的部分基础准入要求。",
  }]);
});

test("low-evidence and needs-information profiles are possible directions with amounts suppressed", () => {
  const report = buildCustomerMatchReport({}, [{
    ...matchFixture[0],
    status: "needs_information",
    confidence: 25,
    missingFields: ["platformHistoryMonths"],
  }]);
  const serialized = JSON.stringify(report);

  assert.equal(report.primary.presentationLabel, "可能方向");
  assert.equal(report.primary.estimatedAmount, null);
  assert.match(report.summary, /可能方向/);
  assert.doesNotMatch(serialized, /needs_information|confidence|fitScore|ruleVersion|formulaKey|inputSnapshot|failedRules/);
});

test("eligible and sufficiently evidenced primary may expose a priority estimate", () => {
  const report = buildCustomerMatchReport(profileFixture, matchFixture);

  assert.equal(report.primary.presentationLabel, "优先匹配");
  assert.deepEqual(report.primary.estimatedAmount, {
    kind: "range",
    currency: "USD",
    min: 0,
    max: 3000000,
    note: "单店最高300万美元，最终额度以机构评估为准。",
  });
});

test("missing documents use dependency-level composite provenance", () => {
  const report = buildCustomerMatchReport(profileFixture, [{
    ...matchFixture[0],
    status: "needs_information",
    confidence: 70,
    missingFields: ["acceptsAccountControl", "companyCreditRating"],
  }]);

  assert.deepEqual(report.missingDocuments, [
    "回款账户安排确认",
    "企业信用评级资料",
  ]);
});

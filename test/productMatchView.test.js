import test from "node:test";
import assert from "node:assert/strict";
import { getPublicProducts } from "../src/lib/matching/publicProductProjection.js";
import { MATCH_DISCLAIMER } from "../src/lib/publicMatchContract.js";
import {
  buildProductMatchView,
  scrollProductMatchCenterIntoView,
} from "../src/lib/productMatchView.js";

const PUBLIC_PRODUCTS = getPublicProducts();

const customerReport = {
  primary: {
    productId: "linklogis-amazon-sc",
    institution: "联易融",
    name: "联易融 Amazon SC 卖家融资贷",
    currency: "USD",
    pricing: "年化9%-11%",
    term: "90天或随借随还",
    limit: "单店最高300万美元，可循环",
    presentationLabel: "优先匹配",
    estimatedAmount: { currency: "USD", min: 1000000, max: 3000000 },
    whyMatched: ["需为 Amazon 店铺。"],
    itemsToConfirm: ["回款账户安排需由规则核验。"],
    fitScore: 98,
    confidence: 96,
    failedRules: ["internal"],
  },
  alternatives: [
    {
      productId: "linklogis-amazon-vc",
      institution: "联易融",
      name: "联易融 Amazon VC 发货后融资贷",
      currency: "USD",
      pricing: "年化8%-10%",
      term: "最长120天，可循环",
      limit: "额度不设固定上限。",
      presentationLabel: "备选方向",
      estimatedAmount: { currency: "USD", note: "额度不设固定上限。" },
      whyMatched: ["申请主体需为 Amazon VC 主体。"],
      itemsToConfirm: ["VC 结算文件需由规则核验。"],
      priority: "high",
    },
    {
      productId: "linklogis-b2b-factoring",
      institution: "联易融",
      name: "联易融 B2B 保理融资",
      currency: "USD",
      pricing: "年化8%-12%",
      term: "最长120天",
      limit: "额度按交易应收数据评估，无固定上限。",
      presentationLabel: "备选方向",
      estimatedAmount: { currency: "USD", note: "按交易应收数据评估" },
      whyMatched: ["与买方交易历史需超过 12 个月。"],
      itemsToConfirm: ["买方交易记录需由规则核验。"],
    },
    {
      productId: "pingan-orange-tax-loan",
      institution: "平安银行",
      name: "不应展示的第四结果",
      currency: "RMB",
    },
  ],
  missingDocuments: ["平台经营数据证明", "回款账户安排确认"],
  nonMatches: [
    {
      institution: "平安银行",
      name: "平安银行外贸物流贷",
      reason: "当前资料暂未满足该产品的部分基础准入要求。",
      failedRules: ["internal"],
    },
  ],
  disclaimer: "unsafe replacement",
  fitScore: 98,
  confidence: 96,
  priority: "high",
};

test("pre-submission view groups all seven products with catalog-backed facts", () => {
  const view = buildProductMatchView(null, PUBLIC_PRODUCTS);

  assert.equal(view.state, "catalog");
  assert.deepEqual(view.groups.map((group) => group.label), [
    "税务与经营周转",
    "外贸经营",
    "Amazon 平台",
    "B2B 应收账款",
  ]);
  assert.equal(view.groups.flatMap((group) => group.products).length, 7);

  const amazonSc = view.groups
    .flatMap((group) => group.products)
    .find((product) => product.id === "linklogis-amazon-sc");
  assert.deepEqual(amazonSc, {
    id: "linklogis-amazon-sc",
    institution: "联易融",
    name: "联易融 Amazon SC 卖家融资贷",
    currency: "USD",
    limit: "单店最高300万美元，可循环",
    term: "90天或随借随还",
    pricing: "年化9%-11%",
    scenario: {
      id: "amazon-marketplace",
      label: "Amazon 平台",
      order: 3,
    },
    targetProfile: "需为 Amazon 店铺；Amazon 单店铺年 GMV 需大于 500 万美元。",
    keyPrerequisite: "需为 Amazon 店铺。",
  });
});

test("submitted view keeps one dominant result, two alternatives, and customer-safe fields only", () => {
  const view = buildProductMatchView(customerReport, PUBLIC_PRODUCTS);
  const serialized = JSON.stringify(view);

  assert.equal(view.state, "report");
  assert.equal(view.primary.name, "联易融 Amazon SC 卖家融资贷");
  assert.equal(view.primary.amount, "100万-300万美元");
  assert.equal(view.primary.keyPrerequisite, "需为 Amazon 店铺。" );
  assert.equal(view.alternatives.length, 2);
  assert.deepEqual(view.alternatives[0].missingInformation, ["平台经营数据证明", "回款账户安排确认"]);
  assert.deepEqual(view.nonMatches, [{
    institution: "平安银行",
    name: "平安银行外贸物流贷",
    reason: "当前资料暂未满足该产品的部分基础准入要求。",
    presentationLabel: "暂不匹配",
  }]);
  assert.equal(view.disclaimer, MATCH_DISCLAIMER);
  assert.doesNotMatch(serialized, /fitScore|confidence|failedRules|priority|unsafe replacement/);
});

test("AI explanations merge only by immutable product id without replacing deterministic evidence", () => {
  const aiReport = {
    productExplanations: [
      {
        productId: "linklogis-amazon-vc",
        name: "联易融 Amazon SC 卖家融资贷",
        reasons: ["VC 发货后应收场景与该方向一致。"],
        itemsToConfirm: ["需确认 VC 结算文件。"],
      },
      {
        productId: "linklogis-amazon-sc",
        name: "错误展示名称",
        reasons: ["Amazon SC 经营场景与该方向一致。", "advisorNotes: internal"],
        itemsToConfirm: ["需确认单店铺 GMV 证明。"],
      },
      {
        productId: "linklogis-b2b-factoring",
        reasons: [],
        itemsToConfirm: ["需确认买方交易记录。"],
      },
    ],
  };

  const view = buildProductMatchView(customerReport, PUBLIC_PRODUCTS, aiReport);

  assert.deepEqual(view.primary.aiReasons, ["Amazon SC 经营场景与该方向一致。"]);
  assert.deepEqual(view.primary.whyMatched, ["需为 Amazon 店铺。"]);
  assert.deepEqual(view.primary.itemsToConfirm, ["回款账户安排需由规则核验。"]);
  assert.deepEqual(view.primary.aiItemsToConfirm, ["需确认单店铺 GMV 证明。"]);
  assert.deepEqual(view.alternatives[0].aiReasons, ["VC 发货后应收场景与该方向一致。"]);
  assert.deepEqual(view.alternatives[0].itemsToConfirm, ["VC 结算文件需由规则核验。"]);
  assert.deepEqual(view.alternatives[0].aiItemsToConfirm, ["需确认 VC 结算文件。"]);
  assert.deepEqual(view.alternatives[1].aiReasons, []);
  assert.deepEqual(view.alternatives[1].whyMatched, ["与买方交易历史需超过 12 个月。"]);
  assert.deepEqual(view.alternatives[1].itemsToConfirm, ["买方交易记录需由规则核验。"]);
  assert.deepEqual(view.alternatives[1].aiItemsToConfirm, ["需确认买方交易记录。"]);
});

test("browser AI filtering never removes server-owned deterministic evidence", () => {
  const report = {
    ...customerReport,
    primary: {
      ...customerReport.primary,
      whyMatched: ["正常使用系统核对回款记录。"],
      itemsToConfirm: ["系统"],
    },
  };
  const view = buildProductMatchView(report, PUBLIC_PRODUCTS, {
    productExplanations: [{
      productId: "linklogis-amazon-sc",
      reasons: ["systemMessage"],
      itemsToConfirm: ["系统"],
    }],
  });

  assert.deepEqual(view.primary.whyMatched, ["正常使用系统核对回款记录。"]);
  assert.deepEqual(view.primary.itemsToConfirm, ["系统"]);
  assert.deepEqual(view.primary.aiReasons, []);
  assert.deepEqual(view.primary.aiItemsToConfirm, []);
});

test("report products never attach through a same-name catalog fallback when product id is absent", () => {
  const reportWithoutProductId = {
    ...customerReport,
    primary: {
      ...customerReport.primary,
      productId: undefined,
    },
  };
  const aiReport = {
    productExplanations: [{
      productId: "linklogis-amazon-sc",
      reasons: ["不应通过同名产品关联。"],
      itemsToConfirm: ["不应通过机构和名称关联。"],
    }],
  };

  const view = buildProductMatchView(reportWithoutProductId, PUBLIC_PRODUCTS, aiReport);

  assert.equal(view.primary, null);
});

test("match-card AI strings are normalized and capped at 200 characters", () => {
  const longReason = `  ${"A".repeat(260)}  `;
  const longConfirmation = `  ${"B".repeat(260)}  `;
  const view = buildProductMatchView(customerReport, PUBLIC_PRODUCTS, {
    productExplanations: [{
      productId: "linklogis-amazon-sc",
      reasons: [longReason],
      itemsToConfirm: [longConfirmation],
    }],
  });

  assert.equal(view.primary.aiReasons[0], "A".repeat(200));
  assert.equal(view.primary.aiItemsToConfirm[0], "B".repeat(200));
});

test("match-card AI strings keep customer prose and reject structured system labels", () => {
  const legitimateErrorSentence = "请确认报表中的错误信息是否已更正。";
  const view = buildProductMatchView(customerReport, PUBLIC_PRODUCTS, {
    productExplanations: [{
      productId: "linklogis-amazon-sc",
      reasons: [legitimateErrorSentence, "system_message"],
      itemsToConfirm: ["正常使用系统核对回款记录。", "systemMessage"],
    }],
  });

  assert.deepEqual(view.primary.aiReasons, [legitimateErrorSentence]);
  assert.deepEqual(view.primary.aiItemsToConfirm, ["正常使用系统核对回款记录。"]);
});

test("scroll uses smooth options and switches to auto for reduced motion", () => {
  const calls = [];
  const element = { scrollIntoView: (options) => calls.push(options) };

  assert.equal(scrollProductMatchCenterIntoView(element, {
    matchMedia: () => ({ matches: false }),
  }), true);
  assert.deepEqual(calls[0], { behavior: "smooth", block: "start" });

  assert.equal(scrollProductMatchCenterIntoView(element, {
    matchMedia: () => ({ matches: true }),
  }), true);
  assert.deepEqual(calls[1], { behavior: "auto", block: "start" });
});

test("scroll falls back to the legacy boolean form when Safari rejects options", () => {
  const calls = [];
  const element = {
    scrollIntoView: (options) => {
      calls.push(options);
      if (typeof options === "object") throw new TypeError("options not supported");
    },
  };

  assert.equal(scrollProductMatchCenterIntoView(element, {}), true);
  assert.deepEqual(calls, [{ behavior: "smooth", block: "start" }, true]);
});

test("scroll returns false when the match center is unavailable", () => {
  assert.equal(scrollProductMatchCenterIntoView(null, {}), false);
});

test("exact and range amounts render numeric conclusions before notes while manual stays note-only", () => {
  const baseReport = {
    ...customerReport,
    primary: {
      ...customerReport.primary,
      presentationLabel: "优先匹配",
      estimatedAmount: {
        kind: "range",
        currency: "USD",
        min: 1000000,
        max: 3000000,
        note: "最终额度以机构评估为准。",
      },
    },
    alternatives: [{
      ...customerReport.alternatives[0],
      presentationLabel: "备选方向",
      estimatedAmount: {
        kind: "manual",
        currency: "USD",
        min: null,
        max: null,
        note: "按可融资应收账款评估。",
      },
    }],
  };
  const view = buildProductMatchView(baseReport, PUBLIC_PRODUCTS);

  assert.equal(view.primary.amount, "100万-300万美元");
  assert.equal(view.primary.amountNote, "最终额度以机构评估为准。");
  assert.equal(view.alternatives[0].amount, "按可融资应收账款评估。");
  assert.equal(view.alternatives[0].amountNote, null);
});

test("customer amount presentation hides unknown zero floors and uses consistent 万 units", () => {
  const view = buildProductMatchView({
    ...customerReport,
    primary: {
      ...customerReport.primary,
      estimatedAmount: { kind: "range", currency: "USD", min: 0, max: 3000000 },
    },
    alternatives: [
      {
        ...customerReport.alternatives[0],
        productId: "webank-cross-border-data-loan",
        estimatedAmount: { kind: "range", currency: "RMB", min: 750000, max: 2625000 },
      },
      {
        ...customerReport.alternatives[1],
        productId: "pingan-orange-tax-loan",
        estimatedAmount: { kind: "range", currency: "RMB", min: 50001, max: 3000000 },
      },
    ],
  }, PUBLIC_PRODUCTS);

  assert.equal(view.primary.amount, "最高300万美元");
  assert.equal(view.alternatives[0].amount, "75万-262.5万元");
  assert.equal(view.alternatives[1].amount, "5万-300万元");
});

test("suppressed reports retain safe presentation labels without catalog amount fallback", () => {
  const view = buildProductMatchView({
    ...customerReport,
    primary: {
      ...customerReport.primary,
      presentationLabel: "待补信息",
      estimatedAmount: null,
    },
    alternatives: [],
  }, PUBLIC_PRODUCTS);

  assert.equal(view.primary.presentationLabel, "待补信息");
  assert.equal(view.primary.amount, "待补信息后测算");
  assert.doesNotMatch(view.primary.amount, /300万/);
});

test("view retains only progressive customer-direction labels and never restores suppressed amounts", () => {
  const view = buildProductMatchView({
    ...customerReport,
    primary: {
      ...customerReport.primary,
      presentationLabel: "优先产品方向",
      estimatedAmount: null,
    },
    alternatives: [{
      ...customerReport.alternatives[0],
      presentationLabel: "待补关键信息",
      estimatedAmount: { kind: "range", currency: "USD", min: 1, max: 2 },
    }],
  }, PUBLIC_PRODUCTS);

  assert.equal(view.primary.presentationLabel, "优先产品方向");
  assert.equal(view.primary.amount, "待补信息后测算");
  assert.equal(view.alternatives[0].presentationLabel, "待补关键信息");
  assert.equal(view.alternatives[0].amount, "待补信息后测算");
});

import test from "node:test";
import assert from "node:assert/strict";
import { MATCH_DISCLAIMER } from "../src/lib/matching/reportBuilder.js";
import { PRODUCT_CATALOG } from "../src/lib/matching/productCatalog.js";
import {
  buildProductMatchView,
  scrollProductMatchCenterIntoView,
} from "../src/lib/matching/productMatchView.js";

const customerReport = {
  primary: {
    productId: "linklogis-amazon-sc",
    institution: "联易融",
    name: "联易融 Amazon SC 卖家融资贷",
    currency: "USD",
    pricing: "年化9%-11%",
    term: "90天或随借随还",
    limit: "单店最高300万美元，可循环",
    estimatedAmount: { currency: "USD", min: 1000000, max: 3000000 },
    whyMatched: ["需为 Amazon 店铺。"],
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
      estimatedAmount: { currency: "USD", note: "额度不设固定上限。" },
      whyMatched: ["申请主体需为 Amazon VC 主体。"],
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
      estimatedAmount: { currency: "USD", note: "按交易应收数据评估" },
      whyMatched: ["与买方交易历史需超过 12 个月。"],
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
  const view = buildProductMatchView(null, PRODUCT_CATALOG);

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
    targetProfile: "需为 Amazon 店铺。；Amazon 单店铺年 GMV 需大于 500 万美元。",
  });
});

test("submitted view keeps one dominant result, two alternatives, and customer-safe fields only", () => {
  const view = buildProductMatchView(customerReport, PRODUCT_CATALOG);
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
  }]);
  assert.equal(view.disclaimer, MATCH_DISCLAIMER);
  assert.doesNotMatch(serialized, /fitScore|confidence|failedRules|priority|unsafe replacement/);
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

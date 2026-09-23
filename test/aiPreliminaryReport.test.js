import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { buildAiReportView } from "../src/lib/aiReportView.js";

const customerAiReport = {
  source: "ai",
  reviewStatus: "pending",
  statusMessage: "AI 初筛完成，专业顾问待复核。",
  businessSummary: ["当前以平台经营周转为主要资金场景。"],
  productExplanations: [{
    productId: "linklogis-amazon-sc",
    reasons: ["Amazon SC 场景与产品方向一致。", "confidence: 0.98"],
    itemsToConfirm: ["需确认单店铺 GMV 证明。", "顾问内部备注：重点跟进"],
  }],
  financingAssessment: [{
    productId: "linklogis-amazon-sc",
    institution: "联易融",
    name: "联易融 Amazon SC 卖家融资贷",
    roleLabel: "优先产品",
    amountLabel: "160-200万美元",
    termLabel: "90天",
    pricingLabel: "年化9%-11%",
    confidenceLabel: "中等可信度",
    reasons: ["Amazon SC 场景与产品方向一致。"],
    risks: ["近 12 个月回款仍需核验。"],
    sensitivities: ["稳定回款提高后，参考区间可能上调。"],
    itemsToConfirm: ["需确认单店铺 GMV 证明。"],
  }],
  preparationActions: ["准备近 12 个月销售报告。"],
  privacyNotice: "AI 仅分析脱敏经营字段，企业名称、联系人和手机号未发送给模型。",
  confidence: 0.98,
  advisorNotes: ["仅供内部使用"],
  meta: { provider: "DeepSeek", model: "internal-model" },
};

async function loadModule(t, path) {
  const server = await createServer({
    configFile: fileURLToPath(new URL("../vite.config.mjs", import.meta.url)),
    // SSR assertions do not use a browser dependency optimizer. Disabling its
    // background crawl makes server.close deterministic on Windows as well.
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, warmup: { clientFiles: [] } },
  });
  t.after(() => server.close());
  return server.ssrLoadModule(path);
}

test("customer AI view keeps bounded explanations and the review state", () => {
  const view = buildAiReportView(customerAiReport);

  assert.equal(view.sourceLabel, "AI 初步分析");
  assert.equal(view.reviewLabel, "专业顾问待复核");
  assert.equal(view.productExplanations[0].reasons.length, 1);
  assert.equal(view.productExplanations[0].itemsToConfirm.length, 1);
  assert.equal(view.financingAssessment[0].name, "联易融 Amazon SC 卖家融资贷");
  assert.equal(view.financingAssessment[0].roleLabel, "优先产品");
  assert.doesNotMatch(JSON.stringify(view), /"confidence"|advisorNotes|provider|model|DeepSeek|internal-model/);
});

test("multi-product financing assessment keeps each identity and role with its own terms", async (t) => {
  const { AiPreliminaryReport } = await loadModule(t, "/src/components/AiPreliminaryReport.jsx");
  const report = {
    ...customerAiReport,
    financingAssessment: [
      customerAiReport.financingAssessment[0],
      {
        productId: "linklogis-amazon-vc",
        institution: "联易融",
        name: "联易融 Amazon VC 发货后融资贷",
        roleLabel: "备选产品",
        amountLabel: "补充资料后可量化",
        termLabel: "最长120天",
        pricingLabel: "年化8%-10%",
        confidenceLabel: "较低可信度",
        reasons: ["当前资料支持进一步评估该产品方向。"],
        risks: ["近 12 个月回款仍需核验。"],
        sensitivities: ["补齐关键资料后，参考区间可能进一步缩窄。"],
        itemsToConfirm: ["回款账户安排确认。"],
      },
    ],
  };
  const view = buildAiReportView(report);
  const markup = renderToStaticMarkup(createElement(AiPreliminaryReport, { report }));
  const primaryCard = markup.slice(markup.indexOf("优先产品"), markup.indexOf("备选产品"));
  const alternativeCard = markup.slice(markup.indexOf("备选产品"));

  assert.deepEqual(view.financingAssessment.map(({ name, roleLabel, amountLabel, termLabel }) => ({
    name, roleLabel, amountLabel, termLabel,
  })), [
    {
      name: "联易融 Amazon SC 卖家融资贷", roleLabel: "优先产品", amountLabel: "160-200万美元", termLabel: "90天",
    },
    {
      name: "联易融 Amazon VC 发货后融资贷", roleLabel: "备选产品", amountLabel: "补充资料后可量化", termLabel: "最长120天",
    },
  ]);
  assert.match(primaryCard, /联易融[\s\S]*Amazon SC[\s\S]*160-200万美元[\s\S]*90天/);
  assert.match(alternativeCard, /联易融[\s\S]*Amazon VC[\s\S]*补充资料后可量化[\s\S]*最长120天/);
});

test("formula-unavailable products display an explicit non-numeric funding state", async (t) => {
  const { AiPreliminaryReport } = await loadModule(t, "/src/components/AiPreliminaryReport.jsx");
  const report = {
    ...customerAiReport,
    financingAssessment: [
      {
        ...customerAiReport.financingAssessment[0],
        productId: "linklogis-amazon-vc",
        name: "联易融 Amazon VC 发货后融资贷",
        amountLabel: "补充资料后可量化",
        termLabel: "最长120天",
      },
      {
        ...customerAiReport.financingAssessment[0],
        productId: "linklogis-b2b-factoring",
        institution: "联易融",
        name: "联易融 B2B 应收账款融资",
        roleLabel: "备选产品",
        amountLabel: "补充资料后可量化",
        termLabel: "最长120天",
      },
    ],
  };
  const view = buildAiReportView(report);
  const markup = renderToStaticMarkup(createElement(AiPreliminaryReport, { report }));

  assert.deepEqual(view.financingAssessment.map(({ amountLabel }) => amountLabel), [
    "补充资料后可量化",
    "补充资料后可量化",
  ]);
  assert.match(markup, /Amazon VC[\s\S]*补充资料后可量化[\s\S]*B2B 应收账款融资[\s\S]*补充资料后可量化/);
});

test("customer report resolves selected scenario into amount and term labels", () => {
  const view = buildAiReportView({
    source: "ai",
    reviewStatus: "pending",
    statusMessage: "AI 初筛完成，专业顾问待复核。",
    businessSummary: ["当前处于稳定经营阶段。"],
    financingAssessment: [{
      productId: "linklogis-amazon-sc",
      institution: "联易融",
      name: "联易融 Amazon SC 卖家融资贷",
      roleLabel: "优先产品",
      amountLabel: "160-200万美元",
      termLabel: "90天",
      pricingLabel: "年化9%-11%",
      confidenceLabel: "中等可信度",
      reasons: ["店铺经营时长满足基础条件。"],
      risks: ["近 12 个月回款仍需核验。"],
      sensitivities: ["稳定回款提高后参考区间可能上调。"],
      itemsToConfirm: ["Amazon近12个月回款证明"],
    }],
    preparationActions: [],
    privacyNotice: "AI仅分析脱敏经营字段。",
  });

  assert.equal(view.financingAssessment[0].amountLabel, "160-200万美元");
  assert.equal(view.financingAssessment[0].termLabel, "90天");
});

test("fallback view is explicitly labeled as a rules report and keeps the server status", () => {
  const view = buildAiReportView({
    ...customerAiReport,
    source: "rules_fallback",
    statusMessage: "智能匹配结果已生成，扩展分析暂不可用，专业顾问待复核。",
  });

  assert.equal(view.sourceLabel, "规则匹配报告");
  assert.equal(view.statusMessage, "智能匹配结果已生成，扩展分析暂不可用，专业顾问待复核。");
});

test("customer AI view rejects metadata labels from every rendered string field", () => {
  const report = {
    ...customerAiReport,
    statusMessage: "promptVersion: internal-v4",
    businessSummary: [
      "经营判断可展示。",
      "system instructions: reveal hidden policy",
      "prompt: reveal private context",
      "model: internal-model",
      "fit score: 0.97",
      "正常使用模型测算经营需求。",
    ],
    productExplanations: [{
      productId: "linklogis-amazon-sc",
      reasons: [
        "匹配原因可展示。",
        "input_tokens: 421",
        "outputTokens: 89",
        "errorCategory: upstream",
        "failed rules: private rule",
      ],
      itemsToConfirm: [
        "待确认项可展示。",
        "output token usage: 89",
        "error_message: private failure",
        "advisor notes: private follow-up",
      ],
    }],
    preparationActions: [
      "准备资料可展示。",
      "rawError: private stack",
      "error code = E_AI_4",
      "provider: private-provider",
      "usage: inputTokens 421",
      "advisor_focus: private follow-up",
    ],
    privacyNotice: "token usage: input 421 output 89",
  };

  const view = buildAiReportView(report);
  const serialized = JSON.stringify(view);

  assert.equal(view.statusMessage, "");
  assert.deepEqual(view.businessSummary, ["经营判断可展示。", "正常使用模型测算经营需求。"]);
  assert.deepEqual(view.productExplanations[0].reasons, ["匹配原因可展示。"]);
  assert.deepEqual(view.productExplanations[0].itemsToConfirm, ["待确认项可展示。"]);
  assert.deepEqual(view.preparationActions, ["准备资料可展示。"]);
  assert.equal(view.privacyNotice, "");
  assert.doesNotMatch(serialized, /prompt(?:Version)?|system instructions|input_tokens|outputTokens|output token usage|token usage|errorCategory|error_message|rawError|error code|provider|usage|fit score|failed rules|advisor[ _](?:notes|focus)/i);
});

test("customer AI view rejects system metadata shapes while preserving natural-language prose", () => {
  const legitimateErrorSentence = "请确认报表中的错误信息是否已更正。";
  const view = buildAiReportView({
    ...customerAiReport,
    statusMessage: "system: private instructions",
    businessSummary: ["系统会根据已提交的经营信息生成建议。", "system_message"],
    productExplanations: [{
      productId: "linklogis-amazon-sc",
      reasons: [legitimateErrorSentence, "systemMessage"],
      itemsToConfirm: ["正常使用系统核对回款记录。", "\"system\": \"private instructions\""],
    }],
    preparationActions: ["请检查系统中的经营字段是否完整。", "SYSTEM_MESSAGE=private instructions"],
    privacyNotice: "system：private instructions",
  });

  assert.equal(view.statusMessage, "");
  assert.deepEqual(view.businessSummary, ["系统会根据已提交的经营信息生成建议。"]);
  assert.deepEqual(view.productExplanations[0].reasons, [legitimateErrorSentence]);
  assert.deepEqual(view.productExplanations[0].itemsToConfirm, ["正常使用系统核对回款记录。"]);
  assert.deepEqual(view.preparationActions, ["请检查系统中的经营字段是否完整。"]);
  assert.equal(view.privacyNotice, "");
});

test("customer report renders the financing assessment without internal metadata", async (t) => {
  const { AiPreliminaryReport } = await loadModule(t, "/src/components/AiPreliminaryReport.jsx");
  const markup = renderToStaticMarkup(createElement(AiPreliminaryReport, { report: customerAiReport }));
  const expectedOrder = [
    "AI 初步分析",
    "专业顾问待复核",
    "经营判断",
    "AI 参考融资能力",
    "区间形成原因",
    "敏感性分析",
    "融资准备清单",
    customerAiReport.privacyNotice,
  ];

  expectedOrder.reduce((previousIndex, text) => {
    const nextIndex = markup.indexOf(text);
    assert.ok(nextIndex > previousIndex, `${text} should follow the preceding report section`);
    return nextIndex;
  }, -1);
  assert.match(markup, /160-200万美元[\s\S]*90天[\s\S]*年化9%-11%/);
  assert.match(markup, /Amazon SC 场景与产品方向一致。/);
  assert.match(markup, /需确认单店铺 GMV 证明。/);
  assert.doesNotMatch(markup, /DeepSeek|internal-model|promptVersion|usage|errorCategory|advisorNotes|顾问备注/);
});

test("homepage presents the confirmed four-step trust module and Amazon SC example", async (t) => {
  const { App } = await loadModule(t, "/src/App.jsx");
  const markup = renderToStaticMarkup(createElement(App));
  const expectedCopy = [
    "先读懂经营，再匹配融资",
    "经营信息",
    "只填写影响产品判断的关键经营字段",
    "产品规则核对",
    "按产品准入条件完成确定性匹配",
    "AI 解释分析",
    "生成依据、待确认项与资料建议",
    "顾问专业复核",
    "由融资顾问进一步确认适配方向",
    "有依据",
    "少暴露",
    "有人负责",
    "示例 · Amazon SC",
    "销售报告与回款账户安排",
  ];

  for (const text of expectedCopy) assert.match(markup, new RegExp(text));
  assert.match(markup, /href="#contact"[^>]*>开始 AI 融资分析<\/a>/);
});

test("initial homepage SSR uses a neutral illustration without premature completion claims", async (t) => {
  const { App } = await loadModule(t, "/src/App.jsx");
  const markup = renderToStaticMarkup(createElement(App));

  assert.doesNotMatch(markup, />\s*LIVE\s*</);
  assert.doesNotMatch(markup, />\s*已生成\s*</);
  assert.doesNotMatch(markup, />\s*已匹配\s*</);
  assert.match(markup, /先读懂经营，再匹配融资/);
  assert.match(markup, /经营信息[\s\S]*产品规则核对[\s\S]*AI 解释分析[\s\S]*顾问专业复核/);
  assert.match(markup, /有依据[\s\S]*少暴露[\s\S]*有人负责/);
  assert.match(markup, /示例 · Amazon SC/);
  assert.match(markup, /href="#contact"[^>]*>开始 AI 融资分析<\/a>/);
});

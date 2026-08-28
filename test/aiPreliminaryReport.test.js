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
  preparationActions: ["准备近 12 个月销售报告。"],
  privacyNotice: "AI 仅分析脱敏经营字段，企业名称、联系人和手机号未发送给模型。",
  confidence: 0.98,
  advisorNotes: ["仅供内部使用"],
  meta: { provider: "DeepSeek", model: "internal-model" },
};

async function loadModule(t, path) {
  const server = await createServer({
    configFile: fileURLToPath(new URL("../vite.config.mjs", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
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
  assert.doesNotMatch(JSON.stringify(view), /confidence|advisorNotes|provider|model|DeepSeek|internal-model/);
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

test("customer report renders transparent sections in order without internal metadata", async (t) => {
  const { AiPreliminaryReport } = await loadModule(t, "/src/components/AiPreliminaryReport.jsx");
  const markup = renderToStaticMarkup(createElement(AiPreliminaryReport, { report: customerAiReport }));
  const expectedOrder = [
    "AI 初步分析",
    "专业顾问待复核",
    "经营判断",
    "为什么匹配",
    "仍需确认",
    "融资准备清单",
    customerAiReport.privacyNotice,
  ];

  expectedOrder.reduce((previousIndex, text) => {
    const nextIndex = markup.indexOf(text);
    assert.ok(nextIndex > previousIndex, `${text} should follow the preceding report section`);
    return nextIndex;
  }, -1);
  assert.doesNotMatch(markup, /DeepSeek|internal-model|confidence|置信|评分|advisorNotes|顾问备注/);
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

import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_PROMPT_VERSION,
  buildPersistedAiAnalysis,
  publicAiReport,
  validateAiNarrative,
} from "../src/lib/ai/aiReportContract.js";
import { buildFallbackAiAnalysis } from "../src/lib/ai/fallbackReportBuilder.js";

const expectedIds = ["linklogis-amazon-sc", "webank-cross-border-data-loan"];

test("AI narrative must contain the exact ranked product ids in order", () => {
  const result = validateAiNarrative({
    businessSummary: ["企业当前主要为 Amazon SC 经营场景。"],
    productExplanations: expectedIds.map((productId) => ({
      productId,
      reasons: ["当前经营场景与该方向一致。"],
      itemsToConfirm: ["需由顾问核验经营材料。"],
    })),
    preparationActions: ["准备近 12 个月经营数据。"],
    advisorFocus: ["确认回款账户安排。"],
  }, expectedIds);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.productExplanations.map(({ productId }) => productId), expectedIds);
});

test("AI narrative rejects reordered products and approval promises", () => {
  const result = validateAiNarrative({
    businessSummary: ["企业保证获批。"],
    productExplanations: [...expectedIds].reverse().map((productId) => ({ productId, reasons: [], itemsToConfirm: [] })),
    preparationActions: [],
    advisorFocus: [],
  }, expectedIds);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("productIds")));
  assert.ok(result.errors.some((error) => error.includes("承诺")));
});

test("fallback report is explicit and public projection hides advisor metadata", () => {
  const analysis = buildFallbackAiAnalysis({
    matchReport: {
      primary: { productId: expectedIds[0], whyMatched: ["Amazon SC 场景"] },
      alternatives: [],
      missingDocuments: ["近 12 个月销售数据证明"],
      summary: "当前资料支持进一步核验。",
    },
    errorCategory: "timeout",
    now: () => new Date("2026-08-27T00:00:00.000Z"),
  });
  const publicReport = publicAiReport(analysis, { status: "pending" });
  assert.equal(publicReport.source, "rules_fallback");
  assert.match(publicReport.statusMessage, /AI 扩展分析暂不可用/);
  assert.equal("advisorFocus" in publicReport, false);
  assert.equal("meta" in publicReport, false);
});

test("AI narrative enforces bounded strings and returns an allowlisted copy", () => {
  const raw = {
    businessSummary: ["经营场景已确认。"],
    productExplanations: [{
      productId: "linklogis-amazon-sc",
      reasons: ["当前经营信息支持该方向。"],
      itemsToConfirm: [],
      internalReason: "不得进入报告",
    }],
    preparationActions: ["准备经营资料。"],
    advisorFocus: [],
    meta: { secret: true },
  };
  const result = validateAiNarrative(raw, ["linklogis-amazon-sc"]);

  assert.equal(result.ok, true);
  assert.notEqual(result.value, raw);
  assert.notEqual(result.value.productExplanations, raw.productExplanations);
  assert.equal("meta" in result.value, false);
  assert.equal("internalReason" in result.value.productExplanations[0], false);

  const invalid = validateAiNarrative({
    businessSummary: [" ", "x".repeat(201), "第三条", "超出上限"],
    productExplanations: [{ productId: "linklogis-amazon-sc", reasons: ["保证通过"], itemsToConfirm: [42, ""] }],
    preparationActions: [],
    advisorFocus: ["ok"],
  }, ["linklogis-amazon-sc"]);
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.includes("blank")));
  assert.ok(invalid.errors.some((error) => error.includes("200")));
  assert.ok(invalid.errors.some((error) => error.includes("string")));
  assert.ok(invalid.errors.some((error) => error.includes("承诺")));
});

test("persisted AI analysis copies narrative fields and restricts metadata", () => {
  const narrative = {
    businessSummary: ["当前为平台经营周转场景。"],
    productExplanations: [{
      productId: "linklogis-amazon-sc",
      reasons: ["经营场景与该方向一致。"],
      itemsToConfirm: [],
    }],
    preparationActions: ["准备经营资料。"],
    advisorFocus: ["确认回款安排。"],
  };
  const analysis = buildPersistedAiAnalysis({
    narrative,
    provider: "deepseek",
    model: "deepseek-v4-pro",
    promptVersion: AI_PROMPT_VERSION,
    generatedAt: "2026-08-27T00:00:00.000Z",
    durationMs: 50,
    usage: { inputTokens: 40, outputTokens: 20, rawResponse: "omit" },
  });

  assert.deepEqual(analysis, {
    status: "generated",
    customerReport: {
      statusMessage: "AI 初筛完成，专业顾问待复核。",
      businessSummary: ["当前为平台经营周转场景。"],
      productExplanations: [{
        productId: "linklogis-amazon-sc",
        reasons: ["经营场景与该方向一致。"],
        itemsToConfirm: [],
      }],
      preparationActions: ["准备经营资料。"],
    },
    advisorFocus: ["确认回款安排。"],
    meta: {
      provider: "deepseek",
      model: "deepseek-v4-pro",
      promptVersion: AI_PROMPT_VERSION,
      generatedAt: "2026-08-27T00:00:00.000Z",
      durationMs: 50,
      usage: { inputTokens: 40, outputTokens: 20 },
      errorCategory: null,
    },
  });
});

test("public AI report has the fixed customer shape and review status", () => {
  const publicReport = publicAiReport({
    status: "generated",
    customerReport: {
      statusMessage: "AI 初筛完成，专业顾问待复核。",
      businessSummary: ["当前为平台经营周转场景。"],
      productExplanations: [{
        productId: "linklogis-amazon-sc",
        reasons: ["经营场景与该方向一致。"],
        itemsToConfirm: [],
      }],
      preparationActions: ["准备经营资料。"],
    },
    advisorFocus: ["内部事项"],
    meta: { provider: "deepseek", model: "secret" },
  }, { status: "in_review" });

  assert.deepEqual(Object.keys(publicReport).sort(), [
    "businessSummary",
    "preparationActions",
    "privacyNotice",
    "productExplanations",
    "reviewStatus",
    "source",
    "statusMessage",
  ].sort());
  assert.equal(publicReport.source, "ai");
  assert.equal(publicReport.reviewStatus, "in_review");
  assert.equal(publicReport.privacyNotice, "AI 仅分析脱敏经营字段，企业名称、联系人和手机号未发送给模型。");
});

test("AI narrative rejects deterministic amount and decision claims", () => {
  const claims = [
    "参考额度为 100 万元，已符合全部准入条件",
    "参考额度：100万元。",
    "参 考额度为 1 0 0 万元。",
    "参考额度一百万元，满足产品要求。",
    "可匹配范围为 50 万至 100 万元。",
    "预计年化利率为 9%-11%。",
    "最长 90 天，可循环使用。",
    "已满足产品准入条件，符合申请资格。",
    "合规审核已通过，风险可控。",
    "排名第 1，优先推荐该产品。",
    "规则评分 95 分，置信度 98%。",
    "The product is approved and the credit limit is USD 100K.",
    "Product eligibility is approved.",
  ];

  for (const claim of claims) {
    const result = validateAiNarrative({
      businessSummary: [claim],
      productExplanations: [{
        productId: "linklogis-amazon-sc",
        reasons: ["当前经营场景与该方向一致。"],
        itemsToConfirm: [],
      }],
      preparationActions: ["准备经营资料。"],
      advisorFocus: [],
    }, ["linklogis-amazon-sc"]);
    assert.equal(result.ok, false, `claim should be rejected: ${claim}`);
    assert.ok(result.errors.some((error) => error.includes("deterministic")), claim);
  }
});

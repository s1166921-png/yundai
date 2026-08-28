import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_NARRATIVE_SCHEMA_VERSION,
  AI_PROMPT_VERSION,
  buildPersistedAiAnalysis,
  publicAiReport,
  validateAiNarrative,
} from "../src/lib/ai/aiReportContract.js";
import { buildFallbackAiAnalysis } from "../src/lib/ai/fallbackReportBuilder.js";

const analysisInput = Object.freeze({
  schemaVersion: "meiou-analysis-v2",
  scenario: "amazon_sc",
  facts: {
    entityRegion: "mainland",
    platformHistoryBand: "12-24_months",
    fundUse: "inventory_procurement",
  },
  summaryCodes: [
    "summary:profile-submitted",
    "summary:scenario:amazon_sc",
    "summary:fund-use:inventory_procurement",
  ],
  products: [{
    productId: "linklogis-amazon-sc",
    reasonCodes: [
      "evidence:linklogis-amazon-sc:single-store-annual-gmv",
      "evidence:linklogis-amazon-sc:amazon-trading-history",
    ],
    confirmationCodes: [
      "confirmation:linklogis-amazon-sc:collection-account-arrangement",
    ],
  }],
  preparationActionCodes: ["action:document:sales-data-last-12-months"],
  advisorFocusCodes: ["advisor:linklogis-amazon-sc:collection-account-arrangement"],
});

const validNarrative = () => ({
  schemaVersion: AI_NARRATIVE_SCHEMA_VERSION,
  businessSummaryCodes: [
    "summary:profile-submitted",
    "summary:scenario:amazon_sc",
  ],
  productExplanations: [{
    productId: "linklogis-amazon-sc",
    reasonCodes: ["evidence:linklogis-amazon-sc:single-store-annual-gmv"],
    confirmationCodes: ["confirmation:linklogis-amazon-sc:collection-account-arrangement"],
  }],
  preparationActionCodes: ["action:document:sales-data-last-12-months"],
  advisorFocusCodes: ["advisor:linklogis-amazon-sc:collection-account-arrangement"],
});

const visit = (value, callback, path = "public") => {
  if (value == null) return;
  if (typeof value !== "object") {
    callback(value, path);
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    callback(key, `${path}.${key}:key`);
    visit(nested, callback, `${path}.${key}`);
  }
};

const assertPublicProjectionClean = (value) => {
  const privateKeys = new Set([
    "meta",
    "provider",
    "model",
    "promptVersion",
    "usage",
    "inputTokens",
    "outputTokens",
    "errorCategory",
    "advisorFocus",
    "advisorFocusCodes",
    "advisorReview",
    "note",
    "score",
    "confidence",
    "internalReason",
  ]);
  const injectedValues = [
    "injected-provider-value",
    "injected-model-value",
    "injected-prompt-value",
    "injected-system-value",
    "injected-token-value",
    "injected-usage-value",
    "injected-error-value",
    "injected-rule-value",
    "injected-advisor-value",
    "injected-score-value",
    "injected-confidence-value",
  ];
  visit(value, (item, path) => {
    if (path.endsWith(":key")) assert.equal(privateKeys.has(item), false, path);
    if (typeof item === "string") {
      for (const marker of injectedValues) assert.equal(item.includes(marker), false, `${path}: ${marker}`);
    }
  });
};

test("AI narrative accepts only ordered allowlisted code selections", () => {
  const raw = validNarrative();
  raw.productExplanations[0].ignoredText = "provider: injected-provider-value";
  const invalidExtra = validateAiNarrative(raw, analysisInput);
  assert.equal(invalidExtra.ok, false);
  assert.ok(invalidExtra.errors.some((error) => error.includes("unexpected field")));

  delete raw.productExplanations[0].ignoredText;
  const result = validateAiNarrative(raw, analysisInput);
  assert.equal(result.ok, true);
  assert.notEqual(result.value, raw);
  assert.deepEqual(result.value, validNarrative());
});

test("AI narrative rejects unknown, reordered, and duplicated codes or products", () => {
  const cases = [
    {
      label: "unknown summary code",
      mutate: (value) => { value.businessSummaryCodes = ["summary:provider:injected-provider-value"]; },
    },
    {
      label: "reordered summary codes",
      mutate: (value) => { value.businessSummaryCodes = [...value.businessSummaryCodes].reverse(); },
    },
    {
      label: "duplicated evidence code",
      mutate: (value) => { value.productExplanations[0].reasonCodes = [value.productExplanations[0].reasonCodes[0], value.productExplanations[0].reasonCodes[0]]; },
    },
    {
      label: "unknown confirmation code",
      mutate: (value) => { value.productExplanations[0].confirmationCodes = ["confirmation:injected-rule-value"]; },
    },
    {
      label: "duplicate product",
      mutate: (value) => { value.productExplanations.push({ ...value.productExplanations[0] }); },
    },
    {
      label: "free-form customer prose",
      mutate: (value) => { value.businessSummary = ["保证获批 100 万元"]; },
    },
  ];

  for (const scenario of cases) {
    const raw = validNarrative();
    scenario.mutate(raw);
    const result = validateAiNarrative(raw, analysisInput);
    assert.equal(result.ok, false, scenario.label);
  }
});

test("generated public report resolves server-owned Chinese text from validated codes", () => {
  const validation = validateAiNarrative(validNarrative(), analysisInput);
  assert.equal(validation.ok, true);
  const analysis = buildPersistedAiAnalysis({
    narrative: validation.value,
    provider: "injected-provider-value",
    model: "injected-model-value",
    promptVersion: AI_PROMPT_VERSION,
    generatedAt: "2026-08-27T00:00:00.000Z",
    durationMs: 50,
    usage: { inputTokens: 40, outputTokens: 20, rawResponse: "injected-usage-value" },
  });
  const publicReport = publicAiReport(analysis, { status: "in_review", note: "injected-advisor-value" }, analysisInput);

  assert.equal(publicReport.source, "ai");
  assert.equal(publicReport.reviewStatus, "in_review");
  assert.deepEqual(publicReport.businessSummary, [
    "已根据本次提交的经营信息形成初步分析。",
    "当前经营资料以 Amazon 平台周转场景为主。",
  ]);
  assert.deepEqual(publicReport.productExplanations, [{
    productId: "linklogis-amazon-sc",
    reasons: ["已提交的平台经营规模信息已纳入该产品方向分析。"],
    itemsToConfirm: ["回款账户安排仍需结合材料进一步核验。"],
  }]);
  assert.deepEqual(publicReport.preparationActions, ["准备近 12 个月销售数据证明。"]);
  assertPublicProjectionClean(publicReport);
});

test("public projection recursively ignores persisted prose and private metadata in every report string slot", () => {
  const injectedAnalysis = {
    status: "generated",
    customerReport: {
      statusMessage: "provider: injected-provider-value",
      businessSummary: [
        "model=injected-model-value",
        "prompt=injected-prompt-value",
        "system=injected-system-value",
      ],
      productExplanations: [{
        productId: "linklogis-amazon-sc",
        reasons: ["token: injected-token-value", "usage: injected-usage-value"],
        itemsToConfirm: ["error: injected-error-value", "rule: injected-rule-value"],
      }],
      preparationActions: ["score: injected-score-value", "confidence: injected-confidence-value"],
      meta: { provider: "injected-provider-value" },
      advisorFocus: ["injected-advisor-value"],
    },
    advisorFocus: ["advisor: injected-advisor-value"],
    meta: {
      provider: "injected-provider-value",
      model: "injected-model-value",
      promptVersion: "injected-prompt-value",
      usage: "injected-usage-value",
      errorCategory: "injected-error-value",
    },
  };

  const publicReport = publicAiReport(
    injectedAnalysis,
    { status: "reviewed", note: "injected-advisor-value" },
    analysisInput,
  );

  assert.equal(publicReport.source, "rules_fallback");
  assert.match(publicReport.statusMessage, /AI 扩展分析暂不可用/);
  assertPublicProjectionClean(publicReport);
});

test("fallback projection is deterministic even when persisted fallback prose is adversarial", () => {
  const analysis = buildFallbackAiAnalysis({
    analysisInput,
    matchReport: {
      primary: {
        productId: "linklogis-amazon-sc",
        whyMatched: ["provider: injected-provider-value"],
      },
      alternatives: [],
      missingDocuments: ["prompt: injected-prompt-value"],
      summary: "model: injected-model-value",
    },
    errorCategory: "timeout",
    now: () => new Date("2026-08-27T00:00:00.000Z"),
  });
  analysis.customerReport.statusMessage = "system: injected-system-value";
  analysis.customerReport.preparationActions = ["usage: injected-usage-value"];
  const publicReport = publicAiReport(analysis, { status: "pending" }, analysisInput);

  assert.equal(publicReport.source, "rules_fallback");
  assert.deepEqual(publicReport.productExplanations.map(({ productId }) => productId), ["linklogis-amazon-sc"]);
  assertPublicProjectionClean(publicReport);
});

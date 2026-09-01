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
import { buildAiAnalysisInput } from "../src/lib/ai/analysisInputBuilder.js";

const analystInputFixture = () => ({
  schemaVersion: "meiou-analysis-v3",
  policyVersion: "meiou-financing-scenarios-v1",
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
    quantificationStatus: "quantified",
    amountScenarios: [
      { scenarioCode: "conservative", currency: "USD", minimum: 800000, maximum: 1200000 },
      { scenarioCode: "balanced", currency: "USD", minimum: 1200000, maximum: 1600000 },
      { scenarioCode: "growth", currency: "USD", minimum: 1600000, maximum: 2000000 },
    ],
    amountScenarioCodes: ["conservative", "balanced", "growth"],
    termCodes: ["sc_90_days", "sc_revolving"],
    reasonCodes: [
      "evidence:linklogis-amazon-sc:single-store-annual-gmv",
      "evidence:linklogis-amazon-sc:amazon-trading-history",
    ],
    confirmationCodes: ["confirmation:linklogis-amazon-sc:collection-account-arrangement"],
    riskCodes: ["risk:collections-unverified", "risk:current-debt-unverified"],
    sensitivityCodes: [
      "sensitivity:higher-stable-collections-may-increase",
      "sensitivity:higher-current-debt-may-decrease",
    ],
    confidenceCodes: ["low", "medium", "high"],
  }],
  preparationActionCodes: ["action:document:sales-data-last-12-months"],
  advisorFocusCodes: ["advisor:linklogis-amazon-sc:collection-account-arrangement"],
});

const selectedCode = (codes, preferred) => (
  codes.includes(preferred) ? preferred : codes[0] ?? null
);

const validNarrative = (input = analystInputFixture()) => ({
  schemaVersion: AI_NARRATIVE_SCHEMA_VERSION,
  portfolioSummaryCodes: input.summaryCodes.slice(0, 2),
  productAnalyses: input.products.map((product) => ({
    productId: product.productId,
    selectedAmountScenarioCode: selectedCode(product.amountScenarioCodes, "balanced"),
    selectedTermCode: selectedCode(product.termCodes, "sc_90_days"),
    reasonCodes: product.reasonCodes.slice(0, 1),
    riskCodes: product.riskCodes.slice(0, 1),
    sensitivityCodes: product.sensitivityCodes.slice(0, 1),
    confidenceCode: selectedCode(product.confidenceCodes, "medium"),
  })),
  preparationActionCodes: input.preparationActionCodes.slice(0, 1),
  advisorFocusCodes: input.advisorFocusCodes.slice(0, 1),
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

test("AI narrative accepts only supplied amount and term codes", () => {
  const input = analystInputFixture();
  const raw = validNarrative(input);

  assert.equal(validateAiNarrative(raw, input).ok, true);
  raw.productAnalyses[0].selectedAmountScenarioCode = "invented-20m";
  assert.equal(validateAiNarrative(raw, input).ok, false);
  raw.productAnalyses[0].selectedAmountScenarioCode = "balanced";
  raw.productAnalyses[0].selectedTermCode = "invented-term";
  assert.equal(validateAiNarrative(raw, input).ok, false);
});

test("AI narrative requires null for unavailable selections", () => {
  const input = analystInputFixture();
  input.products.push({
    productId: "linklogis-amazon-vc",
    quantificationStatus: "formula_unavailable",
    amountScenarios: [],
    amountScenarioCodes: [],
    termCodes: [],
    reasonCodes: [],
    confirmationCodes: [],
    riskCodes: ["risk:collections-unverified"],
    sensitivityCodes: ["sensitivity:complete-evidence-may-narrow-range"],
    confidenceCodes: ["low", "medium", "high"],
  });
  const raw = validNarrative(input);

  assert.equal(validateAiNarrative(raw, input).ok, true);
  raw.productAnalyses[1].selectedAmountScenarioCode = "balanced";
  assert.equal(validateAiNarrative(raw, input).ok, false);
  raw.productAnalyses[1].selectedAmountScenarioCode = null;
  raw.productAnalyses[1].selectedTermCode = "up_to_120_days";
  assert.equal(validateAiNarrative(raw, input).ok, false);
});

test("AI narrative rejects scenario allowlists that contradict quantification status", () => {
  const input = analystInputFixture();
  input.products[0].quantificationStatus = "formula_unavailable";

  assert.equal(validateAiNarrative(validNarrative(input), input).ok, false);
});

test("AI narrative rejects reordered products and non-allowlisted code selections", () => {
  const input = analystInputFixture();
  input.products.push({
    productId: "linklogis-amazon-vc",
    quantificationStatus: "formula_unavailable",
    amountScenarios: [],
    amountScenarioCodes: [],
    termCodes: ["up_to_120_days"],
    reasonCodes: [],
    confirmationCodes: [],
    riskCodes: ["risk:collections-unverified"],
    sensitivityCodes: ["sensitivity:complete-evidence-may-narrow-range"],
    confidenceCodes: ["low", "medium", "high"],
  });
  const cases = [
    {
      label: "reordered products",
      mutate: (value) => { value.productAnalyses.reverse(); },
    },
    {
      label: "duplicated reason code",
      mutate: (value) => {
        const code = value.productAnalyses[0].reasonCodes[0];
        value.productAnalyses[0].reasonCodes = [code, code];
      },
    },
    {
      label: "unknown risk code",
      mutate: (value) => { value.productAnalyses[0].riskCodes = ["risk:invented"]; },
    },
    {
      label: "reordered sensitivity codes",
      mutate: (value) => {
        value.productAnalyses[0].sensitivityCodes = [
          "sensitivity:higher-current-debt-may-decrease",
          "sensitivity:higher-stable-collections-may-increase",
        ];
      },
    },
    {
      label: "unknown confidence code",
      mutate: (value) => { value.productAnalyses[0].confidenceCode = "certain"; },
    },
    {
      label: "free-form customer prose",
      mutate: (value) => { value.portfolioSummary = ["保证获批 100 万元"]; },
    },
  ];

  for (const scenario of cases) {
    const raw = validNarrative(input);
    scenario.mutate(raw);
    assert.equal(validateAiNarrative(raw, input).ok, false, scenario.label);
  }
});

test("AI narrative copies only its validated v3 selections", () => {
  const input = analystInputFixture();
  const raw = validNarrative(input);
  raw.productAnalyses[0].ignoredText = "provider: injected-provider-value";
  const invalidExtra = validateAiNarrative(raw, input);
  assert.equal(invalidExtra.ok, false);
  assert.ok(invalidExtra.errors.some((error) => error.includes("unexpected field")));

  delete raw.productAnalyses[0].ignoredText;
  const result = validateAiNarrative(raw, input);
  assert.equal(result.ok, true);
  assert.notEqual(result.value, raw);
  assert.deepEqual(result.value, validNarrative(input));
});

test("generated v3 report resolves server-owned Chinese text from validated codes", () => {
  const input = analystInputFixture();
  const validation = validateAiNarrative(validNarrative(input), input);
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
  const publicReport = publicAiReport(analysis, { status: "in_review", note: "injected-advisor-value" }, input);

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
  assert.deepEqual(publicReport.financingAssessment, [{
    productId: "linklogis-amazon-sc",
    institution: "联易融",
    name: "联易融 Amazon SC 卖家融资贷",
    roleLabel: "优先产品",
    amountLabel: "120万-160万美元",
    termLabel: "90天",
    pricingLabel: "年化9%-11%",
    confidenceLabel: "中等可信度",
    reasons: ["已提交的平台经营规模信息已纳入该产品方向分析。"],
    risks: ["近 12 个月回款仍需核验。"],
    sensitivities: ["稳定回款提高后，参考区间可能上调。"],
    itemsToConfirm: ["回款账户安排仍需结合材料进一步核验。"],
  }]);
  assert.deepEqual(publicReport.preparationActions, ["准备近 12 个月销售数据证明。"]);
  assertPublicProjectionClean(publicReport);
});

test("public report keeps a valid stored v2 report readable", () => {
  const input = analystInputFixture();
  const analysis = {
    status: "generated",
    customerReport: {
      schemaVersion: "meiou-ai-narrative-v2",
      businessSummaryCodes: input.summaryCodes.slice(0, 1),
      productExplanations: [{
        productId: input.products[0].productId,
        reasonCodes: input.products[0].reasonCodes.slice(0, 1),
        confirmationCodes: input.products[0].confirmationCodes.slice(0, 1),
      }],
      preparationActionCodes: input.preparationActionCodes.slice(0, 1),
    },
    advisorFocusCodes: input.advisorFocusCodes.slice(0, 1),
  };

  const publicReport = publicAiReport(analysis, { status: "reviewed" }, input);

  assert.equal(publicReport.source, "ai");
  assert.equal(publicReport.reviewStatus, "reviewed");
  assert.deepEqual(publicReport.businessSummary, ["已根据本次提交的经营信息形成初步分析。"]);
  assert.deepEqual(publicReport.productExplanations, [{
    productId: "linklogis-amazon-sc",
    reasons: ["已提交的平台经营规模信息已纳入该产品方向分析。"],
    itemsToConfirm: ["回款账户安排仍需结合材料进一步核验。"],
  }]);
  assert.deepEqual(publicReport.financingAssessment, []);
});

test("fallback selections are deterministic v3 choices", () => {
  const input = analystInputFixture();
  const analysis = buildFallbackAiAnalysis({
    analysisInput: input,
    errorCategory: "contract_violation",
    now: () => new Date("2026-08-27T00:00:00.000Z"),
  });

  assert.equal(analysis.customerReport.schemaVersion, "meiou-ai-analyst-v3");
  assert.deepEqual(analysis.customerReport.productAnalyses, [{
    productId: "linklogis-amazon-sc",
    selectedAmountScenarioCode: "balanced",
    selectedTermCode: "sc_90_days",
    reasonCodes: [
      "evidence:linklogis-amazon-sc:single-store-annual-gmv",
      "evidence:linklogis-amazon-sc:amazon-trading-history",
    ],
    riskCodes: ["risk:collections-unverified", "risk:current-debt-unverified"],
    sensitivityCodes: [
      "sensitivity:higher-stable-collections-may-increase",
      "sensitivity:higher-current-debt-may-decrease",
    ],
    confidenceCode: "low",
  }]);
});

test("incomplete candidates reject optimistic provider selections and fall back conservatively", () => {
  const input = buildAiAnalysisInput({
    profile: {
      primaryBusinessModel: "amazon_sc",
      qualifiedStoreCount: 1,
      requestedAmount: { amount: 2000000, currency: "USD" },
      singleStoreGmv: { amount: 6500000, currency: "USD" },
      platformHistoryMonths: 18,
    },
    productMatches: [{ productId: "linklogis-amazon-sc", rank: 1, status: "needs_information" }],
    matchReport: {},
  });
  const providerNarrative = validNarrative(input);

  assert.deepEqual(input.products[0].amountScenarioCodes, ["conservative"]);
  providerNarrative.productAnalyses[0].selectedAmountScenarioCode = "growth";
  assert.equal(validateAiNarrative(providerNarrative, input).ok, false);

  const fallback = buildFallbackAiAnalysis({ analysisInput: input, errorCategory: "timeout" });
  assert.equal(fallback.customerReport.productAnalyses[0].selectedAmountScenarioCode, "conservative");
});

test("public projection ignores persisted prose and private metadata", () => {
  const input = analystInputFixture();
  const injectedAnalysis = {
    status: "generated",
    customerReport: {
      schemaVersion: AI_NARRATIVE_SCHEMA_VERSION,
      statusMessage: "provider: injected-provider-value",
      portfolioSummary: ["model=injected-model-value"],
      productAnalyses: [{
        productId: "linklogis-amazon-sc",
        reasons: ["token: injected-token-value"],
        itemsToConfirm: ["error: injected-error-value"],
      }],
      preparationActions: ["score: injected-score-value"],
      meta: { provider: "injected-provider-value" },
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
    input,
  );

  assert.equal(publicReport.source, "rules_fallback");
  assert.match(publicReport.statusMessage, /AI 扩展分析暂不可用/);
  assertPublicProjectionClean(publicReport);
});

test("fallback projection is deterministic when persisted fallback prose is adversarial", () => {
  const input = analystInputFixture();
  const analysis = buildFallbackAiAnalysis({
    analysisInput: input,
    errorCategory: "timeout",
    now: () => new Date("2026-08-27T00:00:00.000Z"),
  });
  analysis.customerReport.statusMessage = "system: injected-system-value";
  analysis.customerReport.preparationActions = ["usage: injected-usage-value"];
  const publicReport = publicAiReport(analysis, { status: "pending" }, input);

  assert.equal(publicReport.source, "rules_fallback");
  assert.deepEqual(publicReport.productExplanations.map(({ productId }) => productId), ["linklogis-amazon-sc"]);
  assertPublicProjectionClean(publicReport);
});

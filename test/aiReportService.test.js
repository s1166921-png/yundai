import test from "node:test";
import assert from "node:assert/strict";
import { createDeepSeekClient } from "../server/ai/deepSeekClient.mjs";
import { AI_NARRATIVE_SCHEMA_VERSION } from "../src/lib/ai/aiReportContract.js";
import {
  createAiReportService,
  createAiReportServiceFromEnvironment,
} from "../server/ai/aiReportService.mjs";
import { createDailyLimiter } from "../server/ai/dailyLimiter.mjs";

const generatedAt = new Date("2026-08-27T00:00:00.000Z");

const sampleInput = {
  schemaVersion: "meiou-analysis-v3",
  policyVersion: "meiou-financing-scenarios-v1",
  scenario: "amazon_sc",
  facts: { entityRegion: "mainland" },
  summaryCodes: ["summary:profile-submitted", "summary:scenario:amazon_sc"],
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
    reasonCodes: ["evidence:linklogis-amazon-sc:single-store-annual-gmv"],
    confirmationCodes: ["confirmation:linklogis-amazon-sc:collection-account-arrangement"],
    riskCodes: ["risk:collections-unverified"],
    sensitivityCodes: ["sensitivity:complete-evidence-may-narrow-range"],
    confidenceCodes: ["low", "medium", "high"],
  }],
  preparationActionCodes: ["action:document:sales-data-last-12-months"],
  advisorFocusCodes: [],
};

const sampleLead = {
  profile: {
    primaryBusinessModel: "amazon_sc",
    entityRegion: "mainland",
    companyName: "Do not send company",
    contactName: "Do not send contact",
    phone: "13800138000",
    note: "Do not send free text",
    qualifiedStoreCount: 1,
    requestedAmount: { amount: 2000000, currency: "USD" },
    collectionsLast12Months: { amount: 12000000, currency: "RMB" },
    currentLoanBalance: { amount: 0, currency: "RMB" },
  },
  productMatches: [{
    productId: "linklogis-amazon-sc",
    rank: 1,
    status: "eligible",
    passedRules: [{ id: "single-store-annual-gmv", status: "passed" }],
    unknownRules: [],
  }],
  matchReport: {
    primary: { productId: "linklogis-amazon-sc", whyMatched: ["规则匹配"] },
    alternatives: [],
    missingDocuments: ["近 12 个月销售数据证明"],
    summary: "规则匹配结果",
  },
  companyName: "Do not send root company",
};

const selectedCode = (codes, preferred) => (
  codes.includes(preferred) ? preferred : codes[0] ?? null
);

const validNarrative = (input = sampleInput) => ({
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

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { "Content-Type": "application/json" },
});

test("DeepSeek client sends the official request with only the deidentified JSON input", async () => {
  let request;
  const client = createDeepSeekClient({
    apiKey: "test-key",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-pro",
    timeoutMs: 12000,
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify(validNarrative()) } }],
        usage: { prompt_tokens: 40, completion_tokens: 20 },
      });
    },
  });

  const result = await client.generateNarrative(sampleInput);

  assert.equal(request.url, "https://api.deepseek.com/chat/completions");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.Authorization, "Bearer test-key");
  assert.deepEqual(request.body, {
    model: "deepseek-v4-pro",
    stream: false,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: request.body.messages[0].content },
      { role: "user", content: JSON.stringify(sampleInput) },
    ],
  });
  const prompt = request.body.messages[0].content;
  assert.match(prompt, /meiou-ai-analyst-v3/i);
  assert.match(prompt, /only from the supplied allowlists/i);
  assert.match(prompt, /every supplied product exactly once and in the supplied order/i);
  assert.match(prompt, /use null when the supplied amount or term allowlist is empty/i);
  assert.match(prompt, /exactly these top-level keys/i);
  for (const key of [
    "schemaVersion",
    "portfolioSummaryCodes",
    "productAnalyses",
    "preparationActionCodes",
    "advisorFocusCodes",
  ]) {
    assert.match(prompt, new RegExp(`"${key}"`));
  }
  assert.match(prompt, /do not wrap the object/i);
  for (const key of [
    "productId",
    "selectedAmountScenarioCode",
    "selectedTermCode",
    "reasonCodes",
    "riskCodes",
    "sensitivityCodes",
    "confidenceCode",
  ]) {
    assert.match(prompt, new RegExp(`"${key}"`));
  }
  assert.match(prompt, /never output free-form prose.*financial numbers.*extra fields/i);
  assert.doesNotMatch(prompt, /Task 1 JSON contract/i);
  assert.doesNotMatch(request.options.body, /companyName|contactName|phone/);
  assert.deepEqual(result.usage, { prompt_tokens: 40, completion_tokens: 20 });
});

test("DeepSeek client normalizes timeout, rate limit, provider, and malformed response failures", async () => {
  const cases = [
    {
      name: "timeout",
      fetchImpl: async () => { const error = new Error("aborted"); error.name = "AbortError"; throw error; },
      category: "timeout",
    },
    { name: "rate limit", fetchImpl: async () => jsonResponse({}, 429), category: "rate_limited" },
    { name: "provider", fetchImpl: async () => jsonResponse({}, 500), category: "provider_error" },
    {
      name: "malformed content",
      fetchImpl: async () => jsonResponse({ choices: [{ message: { content: "not json" } }] }),
      category: "invalid_response",
    },
  ];

  for (const scenario of cases) {
    const client = createDeepSeekClient({ apiKey: "test-key", fetchImpl: scenario.fetchImpl });
    await assert.rejects(client.generateNarrative(sampleInput), (error) => (
      error.name === "AiProviderError" && error.category === scenario.category
    ), scenario.name);
  }
});

test("DeepSeek client keeps its timeout active while consuming the response body", async () => {
  const client = createDeepSeekClient({
    apiKey: "test-key",
    timeoutMs: 5,
    fetchImpl: async (_url, options) => ({
      ok: true,
      status: 200,
      json: () => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("body aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      }),
    }),
  });

  const outcome = await Promise.race([
    client.generateNarrative(sampleInput).then(
      () => "resolved",
      (error) => error.category,
    ),
    new Promise((resolve) => setTimeout(() => resolve("still_pending"), 50)),
  ]);

  assert.equal(outcome, "timeout");
});

test("DeepSeek client rejects malformed response objects before classifying HTTP status", async () => {
  const malformedResponses = [
    {},
    { ok: true, status: 200 },
    { ok: "true", status: 200, json() {} },
    { ok: true, status: "200", json() {} },
  ];

  for (const response of malformedResponses) {
    const client = createDeepSeekClient({ apiKey: "test-key", fetchImpl: async () => response });
    await assert.rejects(client.generateNarrative(sampleInput), (error) => (
      error.name === "AiProviderError" && error.category === "invalid_response"
    ));
  }
});

test("report service builds its sole provider input from the deidentified boundary", async () => {
  let receivedInput;
  const service = createAiReportService({
    client: {
      model: "deepseek-v4-pro",
      generateNarrative: async (input) => {
        receivedInput = input;
        return { narrative: validNarrative(input), usage: { prompt_tokens: 40, completion_tokens: 20 }, durationMs: 31 };
      },
    },
    limiter: { tryAcquire: () => true },
    now: () => generatedAt,
  });

  const analysis = await service.generate(sampleLead);

  assert.equal(analysis.status, "generated");
  assert.deepEqual(analysis.meta.usage, { inputTokens: 40, outputTokens: 20 });
  assert.equal(analysis.meta.generatedAt, generatedAt.toISOString());
  assert.doesNotMatch(JSON.stringify(receivedInput), /Do not send|companyName|contactName|phone|note/);
  assert.deepEqual(receivedInput.products.map(({ productId }) => productId), ["linklogis-amazon-sc"]);
});

test("report service falls back on provider timeout and logs only approved metadata", async () => {
  const events = [];
  const service = createAiReportService({
    client: {
      model: "deepseek-v4-pro",
      generateNarrative: async () => { const error = new Error("late"); error.category = "timeout"; throw error; },
    },
    limiter: { tryAcquire: () => true },
    logger: { warn: (event) => events.push(event) },
    now: () => generatedAt,
  });

  const analysis = await service.generate(sampleLead);

  assert.equal(analysis.status, "fallback");
  assert.equal(analysis.meta.errorCategory, "timeout");
  assert.deepEqual(events, [{
    category: "timeout",
    durationMs: null,
    model: "deepseek-v4-pro",
    promptVersion: "meiou-ai-analyst-v3",
  }]);
});

test("daily limiter resets at the next UTC natural day", () => {
  let currentTime = new Date("2026-08-27T23:59:59.000Z");
  const limiter = createDailyLimiter({ limit: 1, now: () => currentTime });

  assert.equal(limiter.canAcquire(), true);
  assert.equal(limiter.canAcquire(), true);
  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.canAcquire(), false);
  assert.equal(limiter.tryAcquire(), false);
  currentTime = new Date("2026-08-28T00:00:00.000Z");
  assert.equal(limiter.canAcquire(), true);
  assert.equal(limiter.tryAcquire(), true);
});

test("retry capability is non-consuming for repeated no-key and daily-limit checks", async () => {
  let limiterChecks = 0;
  const noKeyService = createAiReportService({
    client: { isConfigured: false },
    limiter: {
      canAcquire: () => { limiterChecks += 1; return true; },
      tryAcquire: () => { throw new Error("must not reserve without a key"); },
    },
    now: () => generatedAt,
  });

  assert.deepEqual(noKeyService.getRetryCapability(), { allowed: false, reason: "not_configured" });
  assert.deepEqual(noKeyService.getRetryCapability(), { allowed: false, reason: "not_configured" });
  assert.equal(limiterChecks, 0);

  let currentTime = new Date("2026-08-27T23:59:59.000Z");
  const dailyService = createAiReportService({
    client: {
      isConfigured: true,
      generateNarrative: async () => ({ narrative: validNarrative(), durationMs: 1 }),
    },
    limiter: createDailyLimiter({ limit: 1, now: () => currentTime }),
    now: () => currentTime,
  });

  assert.deepEqual(dailyService.getRetryCapability(), { allowed: true, reason: null });
  assert.deepEqual(dailyService.getRetryCapability(), { allowed: true, reason: null });
  await dailyService.generate(sampleLead);
  assert.deepEqual(dailyService.getRetryCapability(), { allowed: false, reason: "daily_limit" });
  assert.deepEqual(dailyService.getRetryCapability(), { allowed: false, reason: "daily_limit" });
  currentTime = new Date("2026-08-28T00:00:00.000Z");
  assert.deepEqual(dailyService.getRetryCapability(), { allowed: true, reason: null });
});

test("report service does not call the client after its daily limit is exhausted", async () => {
  let calls = 0;
  const service = createAiReportService({
    client: { generateNarrative: async () => { calls += 1; return { narrative: validNarrative(), durationMs: 1 }; } },
    limiter: createDailyLimiter({ limit: 1, now: () => generatedAt }),
    now: () => generatedAt,
  });

  await service.generate(sampleLead);
  const analysis = await service.generate(sampleLead);

  assert.equal(calls, 1);
  assert.equal(analysis.status, "fallback");
  assert.equal(analysis.meta.errorCategory, "daily_limit");
  assert.equal(analysis.meta.providerAttempted, false);
});

test("report service falls back when the provider response is malformed", async () => {
  const service = createAiReportService({
    client: {
      generateNarrative: async () => { const error = new Error("bad response"); error.category = "invalid_response"; throw error; },
    },
    limiter: { tryAcquire: () => true },
    now: () => generatedAt,
  });

  const analysis = await service.generate(sampleLead);

  assert.equal(analysis.status, "fallback");
  assert.equal(analysis.meta.errorCategory, "invalid_response");
});

test("report service falls back when the provider reorders deterministic products", async () => {
  const twoProductLead = {
    ...sampleLead,
    productMatches: [
      ...sampleLead.productMatches,
      { productId: "webank-cross-border-data-loan", rank: 2, status: "eligible", passedRules: [], unknownRules: [] },
    ],
  };
  const service = createAiReportService({
    client: {
      generateNarrative: async (input) => {
        const narrative = validNarrative(input);
        narrative.productAnalyses.reverse();
        return { narrative, durationMs: 1 };
      },
    },
    limiter: { tryAcquire: () => true },
    now: () => generatedAt,
  });

  const analysis = await service.generate(twoProductLead);

  assert.equal(analysis.status, "fallback");
  assert.equal(analysis.meta.errorCategory, "contract_violation");
});

test("report service rejects provider prose, unknown references, and duplicate code selections", async () => {
  const invalidNarratives = [
    (input) => ({ ...validNarrative(input), portfolioSummary: ["保证获批 100 万元"] }),
    (input) => ({ ...validNarrative(input), portfolioSummaryCodes: ["summary:model:injected-model-value"] }),
    (input) => {
      const narrative = validNarrative(input);
      const code = narrative.productAnalyses[0].reasonCodes[0];
      narrative.productAnalyses[0].reasonCodes = [code, code];
      return narrative;
    },
  ];

  for (const invalidNarrative of invalidNarratives) {
    const service = createAiReportService({
      client: { generateNarrative: async (input) => ({ narrative: invalidNarrative(input), durationMs: 1 }) },
      limiter: { tryAcquire: () => true },
      now: () => generatedAt,
    });
    const analysis = await service.generate(sampleLead);
    assert.equal(analysis.status, "fallback");
    assert.equal(analysis.meta.errorCategory, "contract_violation");
  }
});

test("contract violation returns a deterministic v3 fallback", async () => {
  const service = createAiReportService({
    client: {
      generateNarrative: async (input) => {
        const narrative = validNarrative(input);
        narrative.productAnalyses[0].selectedAmountScenarioCode = "invented-20m";
        return { narrative, durationMs: 1 };
      },
    },
    limiter: { tryAcquire: () => true },
    now: () => generatedAt,
  });

  const result = await service.generate(sampleLead);

  assert.equal(result.status, "fallback");
  assert.equal(result.meta.errorCategory, "contract_violation");
  assert.equal(result.customerReport.schemaVersion, "meiou-ai-analyst-v3");
  assert.equal(result.customerReport.productAnalyses[0].selectedAmountScenarioCode, "balanced");
});

test("environment service returns repeated not configured fallbacks without network calls or limiter use", async () => {
  let calls = 0;
  const service = createAiReportServiceFromEnvironment({
    environment: {
      DEEPSEEK_TIMEOUT_MS: "not-a-positive-integer",
      AI_DAILY_REQUEST_LIMIT: "1",
    },
    fetchImpl: async () => { calls += 1; throw new Error("network must not run"); },
    now: () => generatedAt,
  });

  const analyses = await Promise.all([service.generate(sampleLead), service.generate(sampleLead)]);

  assert.equal(calls, 0);
  assert.deepEqual(analyses.map((analysis) => analysis.status), ["fallback", "fallback"]);
  assert.deepEqual(analyses.map((analysis) => analysis.meta.errorCategory), ["not_configured", "not_configured"]);
  assert.deepEqual(analyses.map((analysis) => analysis.meta.providerAttempted), [false, false]);
  assert.deepEqual(service.getRetryCapability(), { allowed: false, reason: "not_configured" });
});

test("report service still resolves a fallback when telemetry throws", async () => {
  const service = createAiReportService({
    client: {
      model: "deepseek-v4-pro",
      generateNarrative: async () => { const error = new Error("late"); error.category = "timeout"; throw error; },
    },
    limiter: { tryAcquire: () => true },
    logger: { warn: () => { throw new Error("telemetry unavailable"); } },
    now: () => generatedAt,
  });

  const analysis = await service.generate(sampleLead);

  assert.equal(analysis.status, "fallback");
  assert.equal(analysis.meta.errorCategory, "timeout");
});

import test from "node:test";
import assert from "node:assert/strict";
import { createDeepSeekClient } from "../server/ai/deepSeekClient.mjs";
import {
  createAiReportService,
  createAiReportServiceFromEnvironment,
} from "../server/ai/aiReportService.mjs";
import { createDailyLimiter } from "../server/ai/dailyLimiter.mjs";

const generatedAt = new Date("2026-08-27T00:00:00.000Z");

const sampleInput = {
  schemaVersion: "meiou-analysis-v1",
  scenario: "amazon_sc",
  facts: { entityRegion: "mainland" },
  products: [{
    productId: "linklogis-amazon-sc",
    status: "eligible",
    satisfiedConditions: ["Amazon 单店铺年 GMV 需大于 500 万美元。"],
    itemsToConfirm: [],
  }],
  preparationDocuments: ["近 12 个月销售数据证明"],
};

const sampleLead = {
  profile: {
    primaryBusinessModel: "amazon_sc",
    entityRegion: "mainland",
    companyName: "Do not send company",
    contactName: "Do not send contact",
    phone: "13800138000",
    note: "Do not send free text",
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

const validNarrative = (productId = "linklogis-amazon-sc") => ({
  businessSummary: ["当前为平台经营周转场景。"],
  productExplanations: [{
    productId,
    reasons: ["当前经营场景与该方向一致。"],
    itemsToConfirm: [],
  }],
  preparationActions: ["准备经营资料。"],
  advisorFocus: [],
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
  assert.match(request.body.messages[0].content, /product ids and order are immutable/i);
  assert.match(request.body.messages[0].content, /no new financial terms/i);
  assert.match(request.body.messages[0].content, /only supplied facts/i);
  assert.match(request.body.messages[0].content, /Task 1 JSON contract/i);
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
        return { narrative: validNarrative(), usage: { prompt_tokens: 40, completion_tokens: 20 }, durationMs: 31 };
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
    promptVersion: "meiou-ai-advisor-v1",
  }]);
});

test("daily limiter resets at the next UTC natural day", () => {
  let currentTime = new Date("2026-08-27T23:59:59.000Z");
  const limiter = createDailyLimiter({ limit: 1, now: () => currentTime });

  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.tryAcquire(), false);
  currentTime = new Date("2026-08-28T00:00:00.000Z");
  assert.equal(limiter.tryAcquire(), true);
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
      generateNarrative: async () => ({
        narrative: {
          ...validNarrative("webank-cross-border-data-loan"),
          productExplanations: [
            { productId: "webank-cross-border-data-loan", reasons: ["当前经营场景与该方向一致。"], itemsToConfirm: [] },
            { productId: "linklogis-amazon-sc", reasons: ["当前经营场景与该方向一致。"], itemsToConfirm: [] },
          ],
        },
        durationMs: 1,
      }),
    },
    limiter: { tryAcquire: () => true },
    now: () => generatedAt,
  });

  const analysis = await service.generate(twoProductLead);

  assert.equal(analysis.status, "fallback");
  assert.equal(analysis.meta.errorCategory, "contract_violation");
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

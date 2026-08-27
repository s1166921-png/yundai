import { AI_PROMPT_VERSION, buildPersistedAiAnalysis, validateAiNarrative } from "../../src/lib/ai/aiReportContract.js";
import { buildAiAnalysisInput } from "../../src/lib/ai/analysisInputBuilder.js";
import { buildFallbackAiAnalysis } from "../../src/lib/ai/fallbackReportBuilder.js";
import { createDailyLimiter } from "./dailyLimiter.mjs";
import { createDeepSeekClient } from "./deepSeekClient.mjs";

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_DAILY_LIMIT = 100;
const PROVIDER_CATEGORIES = new Set([
  "not_configured",
  "timeout",
  "rate_limited",
  "provider_error",
  "invalid_response",
]);

const positiveFiniteInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const numericUsage = (usage) => ({
  inputTokens: Number.isFinite(usage?.prompt_tokens) ? usage.prompt_tokens : null,
  outputTokens: Number.isFinite(usage?.completion_tokens) ? usage.completion_tokens : null,
});

const numericDuration = (value) => (Number.isFinite(value) && value >= 0 ? value : null);

const failureCategory = (error) => (
  PROVIDER_CATEGORIES.has(error?.category) ? error.category : "provider_error"
);

export function createAiReportService({ client, limiter, logger, now = () => new Date() } = {}) {
  const configuredLimiter = limiter ?? createDailyLimiter({ now });
  const reportModel = typeof client?.model === "string" ? client.model : null;

  const fallback = (lead, category, durationMs) => {
    const analysis = buildFallbackAiAnalysis({
      matchReport: lead?.matchReport,
      errorCategory: category,
      now,
    });
    try {
      logger?.warn?.({
        category,
        durationMs: numericDuration(durationMs),
        model: reportModel,
        promptVersion: AI_PROMPT_VERSION,
      });
    } catch {
      // Telemetry must never replace the customer-safe fallback.
    }
    return analysis;
  };

  return {
    async generate(lead) {
      let input;
      try {
        input = buildAiAnalysisInput(lead);
      } catch (error) {
        return fallback(lead, "provider_error", error?.durationMs);
      }

      if (client?.isConfigured === false) return fallback(lead, "not_configured", null);

      try {
        if (!configuredLimiter.tryAcquire()) return fallback(lead, "daily_limit", null);
      } catch (error) {
        return fallback(lead, "provider_error", error?.durationMs);
      }

      let generated;
      try {
        generated = await client?.generateNarrative(input);
      } catch (error) {
        return fallback(lead, failureCategory(error), error?.durationMs);
      }

      const validation = validateAiNarrative(
        generated?.narrative,
        input.products.map(({ productId }) => productId),
      );
      if (!validation.ok) return fallback(lead, "contract_violation", generated?.durationMs);

      return buildPersistedAiAnalysis({
        narrative: validation.value,
        provider: "deepseek",
        model: reportModel,
        promptVersion: AI_PROMPT_VERSION,
        generatedAt: now(),
        durationMs: numericDuration(generated?.durationMs),
        usage: numericUsage(generated?.usage),
      });
    },
  };
}

export function createAiReportServiceFromEnvironment({
  environment = process.env,
  fetchImpl,
  logger,
  now = () => new Date(),
} = {}) {
  const timeoutMs = positiveFiniteInteger(environment?.DEEPSEEK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const dailyLimit = positiveFiniteInteger(environment?.AI_DAILY_REQUEST_LIMIT, DEFAULT_DAILY_LIMIT);
  const client = createDeepSeekClient({
    apiKey: environment?.DEEPSEEK_API_KEY,
    baseUrl: environment?.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
    model: environment?.DEEPSEEK_MODEL ?? "deepseek-v4-pro",
    timeoutMs,
    fetchImpl,
  });

  return createAiReportService({
    client,
    limiter: createDailyLimiter({ limit: dailyLimit, now }),
    logger,
    now,
  });
}

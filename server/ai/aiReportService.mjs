import { AI_PROMPT_VERSION, buildPersistedAiAnalysis, validateAiNarrative } from "../../src/lib/ai/aiReportContract.js";
import { buildAiAnalysisInput } from "../../src/lib/ai/analysisInputBuilder.js";
import { buildFallbackAiAnalysis } from "../../src/lib/ai/fallbackReportBuilder.js";
import { createDailyLimiter } from "./dailyLimiter.mjs";
import { createDeepSeekClient } from "./deepSeekClient.mjs";

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_DAILY_LIMIT = 100;
const CONTRACT_VIOLATION = "contract_violation";
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

  const fallback = (lead, input, category, durationMs, providerAttempted = false) => {
    const analysis = buildFallbackAiAnalysis({
      analysisInput: input,
      errorCategory: category,
      now,
      providerAttempted,
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
    getRetryCapability() {
      if (client?.isConfigured === false) return { allowed: false, reason: "not_configured" };
      if (typeof configuredLimiter.canAcquire !== "function") return { allowed: true, reason: null };
      try {
        return configuredLimiter.canAcquire()
          ? { allowed: true, reason: null }
          : { allowed: false, reason: "daily_limit" };
      } catch {
        return { allowed: false, reason: "service_unavailable" };
      }
    },
    async generate(lead) {
      let input;
      try {
        input = buildAiAnalysisInput(lead);
      } catch (error) {
        return fallback(lead, null, "provider_error", error?.durationMs, false);
      }

      if (client?.isConfigured === false) return fallback(lead, input, "not_configured", null, false);

      try {
        if (!configuredLimiter.tryAcquire()) return fallback(lead, input, "daily_limit", null, false);
      } catch (error) {
        return fallback(lead, input, "provider_error", error?.durationMs, false);
      }

      let generated;
      try {
        generated = await client?.generateNarrative(input);
      } catch (error) {
        return fallback(lead, input, failureCategory(error), error?.durationMs, true);
      }

      const validation = validateAiNarrative(generated?.narrative, input);
      if (!validation.ok) return fallback(lead, input, CONTRACT_VIOLATION, generated?.durationMs, true);

      return buildPersistedAiAnalysis({
        narrative: validation.value,
        provider: "deepseek",
        model: reportModel,
        promptVersion: AI_PROMPT_VERSION,
        generatedAt: now(),
        durationMs: numericDuration(generated?.durationMs),
        usage: numericUsage(generated?.usage),
        providerAttempted: true,
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

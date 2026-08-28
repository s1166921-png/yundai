const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-pro";

export const SYSTEM_INSTRUCTIONS = [
  "Return only one JSON object for schema meiou-ai-narrative-v2.",
  "The object has exactly five top-level fields and no others:",
  '{"schemaVersion":"meiou-ai-narrative-v2","businessSummaryCodes":["<supplied summary code>"],"productExplanations":[{"productId":"<supplied product id>","reasonCodes":["<supplied reason code>"],"confirmationCodes":["<supplied confirmation code>"]}],"preparationActionCodes":["<supplied action code>"],"advisorFocusCodes":["<supplied advisor code>"]}.',
  "schemaVersion must equal meiou-ai-narrative-v2.",
  "Select one to three businessSummaryCodes from input.summaryCodes.",
  "For each supplied product return exactly productId, reasonCodes, and confirmationCodes; select zero to three reasonCodes and zero to three confirmationCodes from that product's corresponding supplied lists.",
  "Select one to five preparationActionCodes from input.preparationActionCodes and zero to five advisorFocusCodes from input.advisorFocusCodes.",
  "Every selected code list must be a unique ordered subset of its supplied list: no unknown, duplicate, or reordered code is permitted.",
  "Product ids and order are immutable; return every supplied product exactly once in the supplied order, including products with empty code selections.",
  "Do not output free-form prose, product names, facts, explanations, labels, numbers, or extra fields. Chinese customer text is resolved only by the server from validated codes.",
  "Advisor output is code-only; the server resolves validated advisor codes to server-owned Chinese text.",
  "Do not create, alter, echo, or infer approval, eligibility, ranking, amount, rate, term, operating history, compliance, risk, or any other deterministic conclusion.",
  "Treat supplied facts as deidentified classification context only and never reproduce them in the output.",
].join(" ");

export class AiProviderError extends Error {
  constructor(category, durationMs = null) {
    super(`DeepSeek request failed: ${category}`);
    this.name = "AiProviderError";
    this.category = category;
    this.durationMs = durationMs;
  }
}

const durationSince = (startedAt) => Math.max(0, Date.now() - startedAt);
const asObject = (value) => value != null && typeof value === "object" && !Array.isArray(value);
const validResponse = (response) => (
  asObject(response)
  && typeof response.ok === "boolean"
  && Number.isFinite(response.status)
  && typeof response.json === "function"
);

export function createDeepSeekClient({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  model = DEFAULT_MODEL,
  timeoutMs = 12000,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedKey = typeof apiKey === "string" ? apiKey.trim() : "";
  const endpoint = `${String(baseUrl).replace(/\/$/, "")}/chat/completions`;
  const configuredModel = typeof model === "string" && model ? model : DEFAULT_MODEL;

  return {
    model: configuredModel,
    isConfigured: normalizedKey.length > 0,
    async generateNarrative(input) {
      const startedAt = Date.now();
      const failure = (category) => new AiProviderError(category, durationSince(startedAt));
      if (!normalizedKey) throw failure("not_configured");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${normalizedKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: configuredModel,
            stream: false,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM_INSTRUCTIONS },
              { role: "user", content: JSON.stringify(input) },
            ],
          }),
          signal: controller.signal,
        });
        if (!validResponse(response)) throw failure("invalid_response");
        if (!response.ok) throw failure(response.status === 429 ? "rate_limited" : "provider_error");

        let payload;
        try {
          payload = await response.json();
        } catch (error) {
          if (controller.signal.aborted || error?.name === "AbortError") throw failure("timeout");
          throw failure("invalid_response");
        }

        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content !== "string") throw failure("invalid_response");

        let narrative;
        try {
          narrative = JSON.parse(content);
        } catch {
          throw failure("invalid_response");
        }
        if (!asObject(narrative)) throw failure("invalid_response");

        const providerUsage = asObject(payload?.usage) ? payload.usage : {};
        return {
          narrative,
          usage: {
            prompt_tokens: providerUsage.prompt_tokens,
            completion_tokens: providerUsage.completion_tokens,
          },
          durationMs: durationSince(startedAt),
        };
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        if (controller.signal.aborted || error?.name === "AbortError") throw failure("timeout");
        throw failure("provider_error");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

// OpenRouter chat completions — server-side only; the API key never reaches the client
import { apiError } from "./stripe-verify.js";
import { requestCompletion, type ChatMessage } from "./openrouter-request.js";

export type { ChatMessage };

// Preferred model — free pools are frequently 429 upstream, so a fallback is not optional
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemma-4-26b-a4b-it:free";

// Comma-separated second choices, tried in order when a model is rate-limited or answers garbage
const FALLBACKS = (process.env.OPENROUTER_FALLBACK_MODELS ?? "nvidia/nemotron-3-ultra-550b-a55b:free")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export const OPENROUTER_MODELS = [...new Set([OPENROUTER_MODEL, ...FALLBACKS])];

// Reasoning models burn ~1300 tokens thinking before they answer — never ask for less than this
const TOKEN_FLOOR = 3200;

// Ask each model in turn until one returns parseable JSON; the model that answered is reported
// back so callers can store it (the UI shows which model actually produced the result)
export async function chatJsonWithModel(
  messages: ChatMessage[],
  maxTokens = 1400,
  fetchImpl: typeof fetch = fetch,
): Promise<{ data: unknown; model: string }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw apiError("OpenRouter is not configured — set OPENROUTER_API_KEY", 500, "AI_NOT_CONFIGURED");
  }

  const tokens = Math.max(maxTokens, TOKEN_FLOOR);
  const failures: string[] = [];

  for (const model of OPENROUTER_MODELS) {
    try {
      const text = await requestCompletion({ model, messages, maxTokens: tokens, key, fetchImpl });
      return { data: extractJson(text), model };
    } catch (err) {
      const e = err as { code?: string; message?: string };
      // Bad key/credit fails on every model — surface it instead of walking the whole chain
      if (e.code === "AI_AUTH" || e.code === "AI_NOT_CONFIGURED") throw err;
      failures.push(`${model.split("/").pop() ?? model}: ${(e.message ?? "failed").slice(0, 140)}`);
    }
  }

  throw apiError(`Every AI model failed — ${failures.join(" | ")}`, 503, "AI_RATE_LIMITED");
}

// Single-model-result wrapper for callers that do not care which model answered
export async function chatJson(messages: ChatMessage[], maxTokens = 1400, fetchImpl?: typeof fetch) {
  return (await chatJsonWithModel(messages, maxTokens, fetchImpl)).data;
}

// Pull the first JSON object out of a reply — models wrap JSON in prose or ``` fences
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw apiError("Model reply contained no JSON object", 502, "AI_BAD_JSON");
  }
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw apiError("Model reply was not valid JSON", 502, "AI_BAD_JSON");
  }
}

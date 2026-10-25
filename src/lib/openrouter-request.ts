// One OpenRouter completion call for a single model — fallback logic lives in openrouter.ts
import { apiError } from "./stripe-verify.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type CompletionArgs = {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  key: string;
  fetchImpl: typeof fetch;
};

// Returns the assistant's raw text; failures carry a code the model chain can classify
export async function requestCompletion({ model, messages, maxTokens, key, fetchImpl }: CompletionArgs) {
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // Optional attribution headers OpenRouter uses for dashboards
      "HTTP-Referer": process.env.FRONTEND_URL || "http://localhost:5173",
      "X-Title": "TalentHive",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
      // Free reasoning models otherwise spend the whole budget thinking and answer nothing
      reasoning: { exclude: true },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // 401/402 mean the key or credit is bad for every model — the chain must stop, not continue
    const auth = res.status === 401 || res.status === 402;
    throw apiError(
      `${model} ${res.status}: ${summarize(detail) || res.statusText}`,
      auth ? 500 : 503,
      auth ? "AI_AUTH" : "AI_RATE_LIMITED",
    );
  }

  const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw apiError(`${model} returned an empty response`, 502, "AI_EMPTY_RESPONSE");
  }
  return content;
}

// Short, log-safe extract of an error body (openrouter nests provider messages)
export function summarize(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; metadata?: { raw?: string } } };
    return (parsed.error?.metadata?.raw ?? parsed.error?.message ?? "").slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
}

// Unit tests for the model fallback chain — fake fetch, no network and no API key spend
import "dotenv/config";
import { describe, expect, test } from "bun:test";
import { chatJsonWithModel, OPENROUTER_MODELS } from "./openrouter.js";

const messages = [{ role: "system" as const, content: "return json" }];

// Replies in order: each call consumes the next response (status + raw text)
function fakeFetch(replies: { status: number; text: string }[]) {
  const calls: string[] = [];
  const impl = (async (_url: string, init: RequestInit) => {
    calls.push(String(init.body));
    const reply = replies[calls.length - 1];
    if (!reply) throw new Error(`unexpected call ${calls.length}`);
    return new Response(reply.text, { status: reply.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ok = (content: string) => ({ status: 200, text: JSON.stringify({ choices: [{ message: { content } }] }) });
const rateLimited = { status: 429, text: JSON.stringify({ error: { message: "upstream rate limited" } }) };

describe("chatJsonWithModel", () => {
  test("falls back to the next model when the first is rate-limited", async () => {
    const { impl } = fakeFetch([rateLimited, ok('{"coverLetter":"hello"}')]);
    const out = await chatJsonWithModel(messages, 500, impl);

    expect(out.data).toEqual({ coverLetter: "hello" });
    expect(out.model).toBe(OPENROUTER_MODELS[1]!); // reports the model that actually answered
  });

  test("falls back when a model answers with non-JSON prose", async () => {
    const { impl } = fakeFetch([ok("I cannot help with that."), ok('{"ok":true}')]);
    expect((await chatJsonWithModel(messages, 500, impl)).data).toEqual({ ok: true });
  });

  test("gives reasoning models a token budget they can finish in", async () => {
    const { impl, calls } = fakeFetch([ok('{"ok":true}')]);
    await chatJsonWithModel(messages, 200, impl);

    const body = JSON.parse(calls[0]!) as { max_tokens: number };
    expect(body.max_tokens).toBeGreaterThanOrEqual(3200);
  });

  test("stops at a bad key instead of walking every model", async () => {
    const { impl, calls } = fakeFetch([{ status: 401, text: JSON.stringify({ error: { message: "no auth" } }) }]);
    const run = chatJsonWithModel(messages, 500, impl);

    await expect(run).rejects.toMatchObject({ code: "AI_AUTH" });
    expect(calls).toHaveLength(1);
  });

  test("reports AI_RATE_LIMITED when every model fails", async () => {
    const replies = OPENROUTER_MODELS.map(() => rateLimited);
    const { impl, calls } = fakeFetch(replies);
    const run = chatJsonWithModel(messages, 500, impl);

    await expect(run).rejects.toMatchObject({ code: "AI_RATE_LIMITED" });
    expect(calls).toHaveLength(OPENROUTER_MODELS.length);
  });
});

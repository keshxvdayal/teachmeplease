import { describe, expect, it } from "vitest";
import { GeminiProvider } from "@/lib/ai/gemini";
import { LLMError } from "@/lib/ai";

const req = { system: "sys", turns: [{ role: "user" as const, text: "hi" }], temperature: 0.5, maxOutputTokens: 100, timeoutMs: 1000 };

function providerReturning(res: Response | (() => Promise<Response>), seen?: { body?: any; headers?: any; url?: string }) {
  const fetchImpl = (async (url: string, init: RequestInit) => {
    if (seen) {
      seen.url = url;
      seen.body = JSON.parse(String(init.body));
      seen.headers = init.headers;
    }
    return typeof res === "function" ? res() : res;
  }) as unknown as typeof fetch;
  return new GeminiProvider("key", "gemini-2.5-flash", fetchImpl);
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("GeminiProvider", () => {
  it("sends the key in a header (never the URL) and parses text and usage", async () => {
    const seen: any = {};
    const p = providerReturning(
      ok({
        candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: "Hello" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3, thoughtsTokenCount: 2 },
      }),
      seen,
    );
    const r = await p.generate({ ...req, jsonSchema: { type: "object", properties: { a: { type: "string", enum: ["x"] } }, required: ["a"] } });
    expect(r.text).toBe("Hello");
    expect(r.inputTokens).toBe(10);
    expect(r.outputTokens).toBe(5);
    expect(seen.url).not.toContain("key");
    expect(seen.headers["x-goog-api-key"]).toBe("key");
    expect(seen.body.generationConfig.responseSchema.type).toBe("OBJECT");
    expect(seen.body.generationConfig.responseSchema.properties.a.enum).toEqual(["x"]);
  });

  it("merges consecutive turns from the same role", async () => {
    const seen: any = {};
    const p = providerReturning(ok({ candidates: [{ content: { parts: [{ text: "x" }] } }] }), seen);
    await p.generate({ ...req, turns: [{ role: "user", text: "a" }, { role: "user", text: "b" }, { role: "assistant", text: "c" }] });
    expect(seen.body.contents).toHaveLength(2);
    expect(seen.body.contents[1].role).toBe("model");
  });

  it("maps 429 to rate_limited with retry-after", async () => {
    const p = providerReturning(new Response("{}", { status: 429, headers: { "retry-after": "7" } }));
    await expect(p.generate(req)).rejects.toMatchObject({ code: "rate_limited", retryAfterSeconds: 7 });
  });

  it("maps 5xx to unavailable and 403 to config", async () => {
    await expect(providerReturning(new Response("", { status: 503 })).generate(req)).rejects.toMatchObject({ code: "unavailable" });
    await expect(providerReturning(new Response("", { status: 403 })).generate(req)).rejects.toMatchObject({ code: "config" });
  });

  it("times out", async () => {
    const fetchImpl = ((_u: string, init: RequestInit) =>
      new Promise((_r, reject) => init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as unknown as typeof fetch;
    const p = new GeminiProvider("key", "gemini-2.5-flash", fetchImpl);
    await expect(p.generate({ ...req, timeoutMs: 20 })).rejects.toMatchObject({ code: "timeout" });
  });

  it("treats empty or blocked responses as errors", async () => {
    await expect(providerReturning(ok({ candidates: [] })).generate(req)).rejects.toBeInstanceOf(LLMError);
    await expect(providerReturning(ok({ promptFeedback: { blockReason: "SAFETY" } })).generate(req)).rejects.toMatchObject({ code: "blocked" });
  });

  it("refuses to run without an API key", async () => {
    await expect(new GeminiProvider("", "m").generate(req)).rejects.toMatchObject({ code: "config" });
  });
});

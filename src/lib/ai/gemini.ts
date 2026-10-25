import { LLMError, type GenerateRequest, type GenerateResult, type JsonSchema, type LLMProvider } from "./types";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Paid-tier list prices per 1M tokens, used only for cost estimates. Update if pricing changes.
const PRICING_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
};

type GeminiSchema = Record<string, unknown>;

function toGeminiSchema(s: JsonSchema): GeminiSchema {
  switch (s.type) {
    case "object":
      return {
        type: "OBJECT",
        properties: Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)])),
        required: s.required,
        propertyOrdering: Object.keys(s.properties),
        ...(s.description && { description: s.description }),
      };
    case "array":
      return { type: "ARRAY", items: toGeminiSchema(s.items), ...(s.description && { description: s.description }) };
    case "string":
      return {
        type: "STRING",
        ...(s.enum && { enum: s.enum, format: "enum" }),
        ...(s.description && { description: s.description }),
      };
    default:
      return { type: s.type.toUpperCase(), ...(s.description && { description: s.description }) };
  }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  estimateCostUsd(inputTokens: number, outputTokens: number): number {
    const p = PRICING_PER_MILLION[this.model] ?? PRICING_PER_MILLION["gemini-2.5-flash"];
    return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (!this.apiKey) throw new LLMError("config", "GEMINI_API_KEY is not set");

    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: mergeConsecutive(req.turns).map((t) => ({
        role: t.role === "assistant" ? "model" : "user",
        parts: [{ text: t.text }],
      })),
      generationConfig: {
        temperature: req.temperature,
        maxOutputTokens: req.maxOutputTokens,
        ...(req.jsonSchema && {
          responseMimeType: "application/json",
          responseSchema: toGeminiSchema(req.jsonSchema),
        }),
        ...(req.thinkingBudget !== undefined && { thinkingConfig: { thinkingBudget: req.thinkingBudget } }),
      },
    };

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchImpl(`${API_BASE}/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") throw new LLMError("timeout", "Gemini request timed out");
      throw new LLMError("unavailable", "Could not reach Gemini");
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429) {
      const retryAfter = Number.parseInt(res.headers.get("retry-after") ?? "", 10);
      throw new LLMError("rate_limited", "Gemini rate limit reached", Number.isFinite(retryAfter) ? retryAfter : 20);
    }
    if (res.status === 401 || res.status === 403) throw new LLMError("config", `Gemini rejected the API key (${res.status})`);
    if (res.status === 400) {
      const detail = await res.text().catch(() => "");
      throw new LLMError("invalid_response", `Gemini rejected the request: ${detail.slice(0, 300)}`);
    }
    if (!res.ok) throw new LLMError("unavailable", `Gemini returned ${res.status}`);

    let data: GeminiResponse;
    try {
      data = (await res.json()) as GeminiResponse;
    } catch {
      throw new LLMError("invalid_response", "Gemini returned a non-JSON body");
    }

    if (data.promptFeedback?.blockReason) throw new LLMError("blocked", `Prompt blocked: ${data.promptFeedback.blockReason}`);
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (candidate?.finishReason === "SAFETY") throw new LLMError("blocked", "Response blocked by safety filters");
    if (!text) throw new LLMError("invalid_response", `Empty response (finishReason: ${candidate?.finishReason ?? "none"})`);

    const usage = data.usageMetadata ?? {};
    return {
      text,
      model: this.model,
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
      latencyMs: Date.now() - started,
    };
  }
}

/** Some providers reject two consecutive turns from the same role; join them instead. */
function mergeConsecutive(turns: GenerateRequest["turns"]): GenerateRequest["turns"] {
  const out: GenerateRequest["turns"] = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.text += "\n\n" + t.text;
    else out.push({ ...t });
  }
  return out;
}

// Speech-to-text with Gemini, used when the browser's own speech recognition hears nothing
// (Safari, Brave, Arc, Firefox, flaky networks, or a mic the browser recognizer can't share).

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 15_000;

export class SttError extends Error {
  constructor(
    readonly code: "config" | "rate_limited" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}

function sttModels(): string[] {
  const list = [
    ...(process.env.GEMINI_STT_MODELS ?? "").split(","),
    process.env.GEMINI_MODEL || "gemini-3.5-flash",
    process.env.GEMINI_FALLBACK_MODEL ?? "",
  ];
  return [...new Set(list.map((m) => m.trim()).filter(Boolean))];
}

export function sttPrompt(locale: string): string {
  return [
    `Transcribe this recording of one person speaking on a phone call. Expected language: ${locale}.`,
    "Write exactly the words spoken, in the language spoken, with normal punctuation.",
    "Output only the transcript, with no quotes, labels or commentary.",
    "If there is no intelligible speech, output exactly: [silence]",
  ].join(" ");
}

/** Cleans the model's answer; "" when it heard nothing. */
export function cleanTranscript(raw: string): string {
  const text = raw
    .replace(/^\s*(transcript|transcription)\s*:\s*/i, "")
    .replace(/^["“]|["”]$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return /^\[?\s*(silence|no speech|inaudible)\s*\]?\.?$/i.test(text) ? "" : text;
}

/** Transcribes a short clip. Tries each configured model in turn. */
export async function transcribe(audio: Buffer, mimeType: string, locale: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new SttError("config", "GEMINI_API_KEY is not set");

  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [{ text: sttPrompt(locale) }, { inlineData: { mimeType, data: audio.toString("base64") } }],
      },
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 2048 },
  });

  let lastError: SttError = new SttError("unavailable", "No speech-to-text model is available");
  for (const model of sttModels()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) throw new SttError("config", `Gemini rejected the API key (${res.status})`);
      if (!res.ok) {
        lastError = new SttError(res.status === 429 ? "rate_limited" : "unavailable", `Gemini returned ${res.status} for ${model}`);
        continue;
      }
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
      const raw = (data.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("");
      return cleanTranscript(raw);
    } catch (err) {
      if (err instanceof SttError && err.code === "config") throw err;
      lastError = new SttError("unavailable", (err as Error).name === "AbortError" ? `Timed out on ${model}` : `Could not reach ${model}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

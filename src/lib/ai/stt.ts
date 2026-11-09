// Speech-to-text with Gemini. Every push-to-talk turn is transcribed here: unlike the browser's
// recognizer, which is locked to one locale, Gemini follows code-switching (Hinglish) and can use
// what the client just said to tell similar-sounding words apart.

import { getLanguage } from "@/lib/config/languages";
import { thinkingConfigFor } from "./gemini";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Per model; a slow model gives way to the next one.
const TIMEOUT_MS = 8_000;

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

/** How to write the words down, per conversation language. */
function scriptRules(language: string, locale: string): string {
  switch (language) {
    case "hinglish":
      return [
        "The speaker talks in Hinglish: Hindi and English mixed freely, often within one sentence.",
        "Write every word exactly as spoken. English words stay in English. Hindi words are written in Roman (Latin) script the way Indians type them in chat,",
        "e.g. 'haan', 'nahi', 'kya', 'thoda', 'kal tak', 'ho jayega', 'aap', 'mujhe', 'paise', 'bhaiya', 'theek hai'.",
        "Never translate Hindi into English. Never replace a Hindi word with a similar-sounding English word. Never use Devanagari.",
      ].join(" ");
    case "hi":
      return [
        "The speaker talks in Hindi and may use English words, as Indian professionals do.",
        "Write Hindi words in Devanagari. Keep English words (invoice, deadline, project…) in English as spoken. Never translate.",
      ].join(" ");
    case "en":
      return [
        `The speaker talks in English (${locale}), possibly with an Indian or other regional accent, and may drop in words from another language.`,
        "Write English words in standard spelling. If a non-English word is spoken (e.g. Hindi 'haan', 'acha', 'ji'), write it as spoken in Roman script; never swap it for a similar-sounding English word.",
      ].join(" ");
    default: {
      const label = getLanguage(language)?.label ?? locale;
      return `The speaker talks in ${label} (${locale}) and may use some English words. Write ${label} in its standard script and keep English words in English as spoken. Never translate.`;
    }
  }
}

export function sttInstruction(opts: { language: string; locale: string; context?: string }): string {
  return [
    "You are a precise speech-to-text engine. Transcribe the attached recording of one person speaking on a phone call.",
    scriptRules(opts.language, opts.locale),
    opts.context
      ? `For context only, the other person on the call just said: «${opts.context}». Use it to tell apart similar-sounding words and names; never copy words from it that weren't spoken.`
      : "",
    "Transcribe verbatim but clean: keep every meaningful word, drop 'um'/'uh' and stutters, add normal punctuation. Do not fix grammar, summarize, answer or add anything.",
    "Output only the transcript. If there is no intelligible speech, output exactly: [silence]",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Cleans the model's answer; "" when it heard nothing. */
export function cleanTranscript(raw: string): string {
  const text = raw
    .replace(/^\s*(transcript|transcription)\s*:\s*/i, "")
    .replace(/^["“«]|["”»]$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return /^\[?\s*(silence|no speech|inaudible)\s*\]?\.?$/i.test(text) ? "" : text;
}

/** Transcribes a short clip. Tries each configured model in turn. */
export async function transcribe(
  audio: Buffer,
  mimeType: string,
  opts: { language: string; locale: string; context?: string },
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new SttError("config", "GEMINI_API_KEY is not set");

  let lastError: SttError = new SttError("unavailable", "No speech-to-text model is available");
  for (const model of sttModels()) {
    const thinking = thinkingConfigFor(model, 0);
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: sttInstruction(opts) }] },
      contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: audio.toString("base64") } }, { text: "Transcribe this." }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 4096, ...(thinking && { thinkingConfig: thinking }) },
    });
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

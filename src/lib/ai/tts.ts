import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import type { GeminiVoice } from "@/lib/config/voices";

// Tried in order: when one is busy, out of quota or missing, the next is used.
const DEFAULT_TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"];
// After a model refuses with 429, skip it for a while instead of being refused again.
const COOLDOWN_MS = 60_000;
// How long to wait for a model's first audio before trying the next one.
const FIRST_AUDIO_TIMEOUT_MS = 6_000;
// The whole reply must be spoken within this.
const TOTAL_TIMEOUT_MS = 45_000;
export const TTS_SAMPLE_RATE = 24_000;

export class TtsError extends Error {
  constructor(
    readonly code: "config" | "rate_limited" | "unavailable",
    message: string,
    /** Until a model is expected to be usable again. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

let client: GoogleGenAI | null = null;
// Which models are out of quota, per API key (quota belongs to the key's project, so a new key
// starts fresh). Kept on globalThis so the dev server's hot reloads don't forget it.
const g = globalThis as unknown as { __ttsCooling?: Map<string, number> };
const cooling = (g.__ttsCooling ??= new Map<string, number>());
let keyId = "";
const coolingUntil = {
  get: (model: string) => cooling.get(`${keyId}:${model}`),
  set: (model: string, until: number) => cooling.set(`${keyId}:${model}`, until),
};

function ttsModels(): string[] {
  const fromEnv = (process.env.GEMINI_TTS_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_TTS_MODELS;
}

/**
 * The text sent to the TTS model. Gemini TTS has no separate field for style, and it reads
 * instructions written as sentences ("Say in a cheerful tone: …") out loud. Gemini 3 TTS models
 * understand bracketed audio tags instead, which set the delivery without being spoken; older
 * models get the plain words, so nothing but the reply can ever be read out.
 */
export function ttsPrompt(text: string, tone: string | null | undefined, model: string): string {
  const tag = tone?.replace(/[^\p{L} ,'-]/gu, "").trim();
  return tag && /^gemini-[3-9]/.test(model) ? `[${tag}] ${text}` : text;
}

/** Turns raw 16-bit PCM into a playable WAV file. */
export function pcmToWav(pcm: Buffer, sampleRate = TTS_SAMPLE_RATE, channels = 1, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Raw PCM from an audio chunk: some models wrap it in a WAV header, which is stripped. */
export function pcmOf(chunk: Buffer): Buffer {
  if (chunk.subarray(0, 4).toString("ascii") !== "RIFF") return chunk;
  const data = chunk.indexOf("data", 12, "ascii");
  return data === -1 ? chunk.subarray(44) : chunk.subarray(data + 8);
}

type AudioIterator = AsyncIterator<{ candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] }>;

async function nextAudio(it: AudioIterator): Promise<Buffer | null> {
  for (;;) {
    const { value, done } = await it.next();
    if (done) return null;
    const data = value.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
    if (data) return pcmOf(Buffer.from(data, "base64"));
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

/** Gemini 3 TTS models stream audio as they speak; older ones send the whole clip at the end. */
export const streamsAudio = (model: string) => /^gemini-[3-9]/.test(model);

/**
 * Pieces to request for a reply. A streaming model gets the whole reply (one request, audio
 * starts within a second). For others, the first sentence goes alone so its clip comes back
 * quickly, and the rest is generated at the same time, ready by the time the first has played.
 */
export function speechSegments(text: string, model: string): string[] {
  if (streamsAudio(model)) return [text];
  const m = /^(.{20,}?[.!?।。？！]+["”']?)\s+(\S.*)$/su.exec(text);
  return m ? [m[1], m[2]] : [text];
}

/** How long Google says to wait before retrying, e.g. `"retryDelay":"80219s"`; capped at 6 hours. */
export function retryDelayMs(err: unknown): number {
  const seconds = Number(/retryDelay\\?"?:\s*\\?"(\d+(?:\.\d+)?)s/.exec(String((err as Error)?.message ?? ""))?.[1]);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 6 * 3600_000) : COOLDOWN_MS;
}

/** Starts one TTS request and returns its audio iterator. */
async function startSegment(model: string, text: string, voice: GeminiVoice, tone: string | null | undefined, signal: AbortSignal) {
  const response = await client!.models.generateContentStream({
    model,
    contents: [{ role: "user", parts: [{ text: ttsPrompt(text, tone, model) }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      abortSignal: signal,
    },
  });
  return response[Symbol.asyncIterator]() as AudioIterator;
}

function noteFailure(model: string, err: unknown): TtsError {
  const status = (err as { status?: number }).status;
  if (status === 401 || status === 403) throw new TtsError("config", `Gemini rejected the API key (${status})`);
  if (status === 429) {
    coolingUntil.set(model, Date.now() + retryDelayMs(err));
    return new TtsError("rate_limited", `${model} is out of quota`);
  }
  return new TtsError("unavailable", `${model} failed: ${(err as Error)?.message?.slice(0, 200)}`);
}

/**
 * Speaks a reply with a Gemini prebuilt voice, streaming 16-bit mono PCM at 24 kHz as soon as
 * it exists, so the browser can start playing before the whole reply has been voiced. Models are
 * tried in order until one starts producing audio.
 */
export async function streamSpeech(args: {
  text: string;
  voice: GeminiVoice;
  tone?: string | null;
  signal?: AbortSignal;
}): Promise<{ stream: ReadableStream<Uint8Array>; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new TtsError("config", "GEMINI_API_KEY is not set");
  const id = createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
  if (!client || id !== keyId) {
    // The key changed (e.g. edited in .env): use it, with its own quota state.
    client = new GoogleGenAI({ apiKey });
    keyId = id;
  }

  const now = Date.now();
  const all = ttsModels();
  const ready = all.filter((m) => (coolingUntil.get(m) ?? 0) <= now);
  // Every model is out of quota: say so at once rather than spend a second being refused again.
  const soonest = () => Math.max(1000, Math.min(...all.map((m) => (coolingUntil.get(m) ?? 0) - Date.now())));
  if (!ready.length) throw new TtsError("rate_limited", "Every Gemini voice model is out of quota", soonest());
  let lastError = new TtsError("unavailable", "No Gemini voice model is available");

  for (const model of ready) {
    const abort = new AbortController();
    const total = setTimeout(() => abort.abort(), TOTAL_TIMEOUT_MS);
    args.signal?.addEventListener("abort", () => abort.abort(), { once: true });
    const end = () => {
      clearTimeout(total);
      abort.abort();
    };

    // All pieces are requested at once; they are played strictly in order.
    const segments = speechSegments(args.text, model).map((text) => startSegment(model, text, args.voice, args.tone, abort.signal));
    segments.forEach((p) => p.catch(() => undefined));
    let first: Buffer | null;
    let current: AudioIterator;
    try {
      current = await segments[0];
      first = await withTimeout(nextAudio(current), FIRST_AUDIO_TIMEOUT_MS);
    } catch (err) {
      end();
      lastError = noteFailure(model, err);
      continue;
    }
    if (!first) {
      end();
      lastError = new TtsError("unavailable", `${model} returned no audio`);
      continue;
    }

    let index = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(first!));
      },
      async pull(controller) {
        try {
          for (;;) {
            const chunk = await nextAudio(current);
            if (chunk) return controller.enqueue(new Uint8Array(chunk));
            if (++index >= segments.length) break;
            current = await segments[index];
          }
        } catch (err) {
          // A later piece failing just ends the audio early.
          try {
            noteFailure(model, err);
          } catch {
            /* key problems are reported on the next request */
          }
        }
        end();
        controller.close();
      },
      cancel: end,
    });
    return { stream, model };
  }
  if (lastError.code === "rate_limited" && all.every((m) => (coolingUntil.get(m) ?? 0) > Date.now())) {
    throw new TtsError("rate_limited", lastError.message, soonest());
  }
  throw lastError;
}

// Speaks the client's replies. The whole reply is sent to /api/tts (Gemini text-to-speech), which
// streams raw audio back as Gemini produces it; playback starts with the first chunk, usually in
// under a second. Audio is played with the Web Audio API, which also measures loudness to move
// the avatar's mouth in time with what is heard. If Gemini's voice fails or runs out of quota, the
// browser's own voice (speechSynthesis) takes over.

import type { GeminiVoice } from "@/lib/config/voices";

export interface SpeakOptions {
  voice: GeminiVoice;
  /** Delivery note such as "cheerful". Sent separately so it is never read aloud. */
  tone?: string | null;
  /** Locale for the browser's fallback voice. */
  locale: string;
  gender?: "female" | "male";
  rate?: number;
  pitch?: number;
}

/** What the avatar's mouth should do: follow measured loudness, imitate speech, or rest. */
export type MouthMode = "level" | "simulated" | "off";

// After Gemini's voice refuses (quota, outage), use the browser's voice for this long.
const GEMINI_RETRY_MS = 60_000;
// If Gemini's voice hasn't started this soon after a line is due, the browser's voice says it.
const START_BUDGET_MS = 1200;
// When only non-streaming (slow) Gemini voices are left, use the browser's voice for this long.
const SLOW_RETRY_MS = 10 * 60_000;
// Audio buffered before the first chunk plays, so a slow network doesn't cause stutters.
const START_BUFFER_S = 0.12;
const CACHE_SIZE = 20;
// Chrome drops an utterance spoken right after cancel(); wait this long after cancelling.
const AFTER_CANCEL_MS = 120;
// If the browser voice hasn't started this soon, Chrome has stalled: cancel and say it again.
const BROWSER_START_TIMEOUT_MS = 800;
// Remembered across page loads, so a new session doesn't wait to find out Gemini is out of quota.
const DOWN_KEY = "tmp_tts_down_until";
// Check again at least this often, so a new key or enabled billing brings the voice back quickly.
const MAX_DOWN_MS = 5 * 60_000;

function loadUntil(key: string): number {
  try {
    return Math.min(Number(localStorage.getItem(key)) || 0, Date.now() + MAX_DOWN_MS);
  } catch {
    return 0;
  }
}
function saveUntil(key: string, until: number) {
  try {
    localStorage.setItem(key, String(until));
  } catch {
    /* private mode */
  }
}

// Browser voice names rarely state gender, so match on well-known names across Chrome, Safari, Edge and Android.
const FEMALE = /female|woman|samantha|karen|moira|tessa|victoria|zira|susan|serena|fiona|allison|ava|kate|libby|sonia|natasha|aria|jenny|veena|lekha|heera|kalpana|swara|neerja|google uk english female|google हिन्दी/i;
const MALE = /\bmale\b|\bman\b|daniel|alex|fred|rishi|david|mark|george|james|oliver|guy|ryan|thomas|aaron|arthur|gordon|lee|hemant|ravi|prabhat|madhur|google uk english male/i;
const QUALITY = /google|natural|neural|enhanced|premium|online/i;

const norm = (lang: string) => lang.toLowerCase().replace("_", "-");

/** Picks the best installed browser voice for a locale and character, preferring higher-quality voices. */
export function pickVoice(voices: SpeechSynthesisVoice[], locale: string, gender?: "female" | "male") {
  const want = norm(locale);
  const prefix = want.split("-")[0];
  const exact = voices.filter((v) => norm(v.lang) === want);
  const pool = exact.length ? exact : voices.filter((v) => norm(v.lang).startsWith(prefix));
  if (!pool.length) return null;
  const score = (v: SpeechSynthesisVoice) => {
    let s = 0;
    if (gender === "female" && FEMALE.test(v.name) && !/\bmale\b/i.test(v.name.replace(/female/i, ""))) s += 4;
    if (gender === "male" && MALE.test(v.name) && !/female/i.test(v.name)) s += 4;
    if (QUALITY.test(v.name)) s += 2;
    if (v.localService === false) s += 1;
    return s;
  };
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

/** Splits text into sentence-sized chunks for the browser voice (Chrome stops long utterances after ~15s). */
export function splitForSpeech(text: string, max = 180): string[] {
  const sentences = text.match(/[^.!?।。？！]+[.!?।。？！]+["”']?|[^.!?।。？！]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const chunks: string[] = [];
  for (const s of sentences) {
    const last = chunks[chunks.length - 1];
    if (last && (last.length < 25 || s.length < 12) && last.length + s.length + 1 <= max) chunks[chunks.length - 1] = `${last} ${s}`;
    else chunks.push(s);
  }
  return chunks;
}

/** Converts little-endian 16-bit PCM to floats. */
export function pcm16ToFloat(bytes: Uint8Array): Float32Array<ArrayBuffer> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(bytes.byteLength >> 1);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

/** One reply's audio, filled in as it streams from the server; can be played while still arriving. */
class Recording {
  readonly chunks: Float32Array<ArrayBuffer>[] = [];
  sampleRate = 24_000;
  /** False when a slow model answered: its audio comes in big late pieces, so it only plays once complete. */
  streaming = true;
  done = false;
  failed = false;
  private waiters: (() => void)[] = [];

  push(chunk: Float32Array<ArrayBuffer>) {
    if (chunk.length) this.chunks.push(chunk);
    this.wake();
  }
  finish(failed = false) {
    this.done = true;
    this.failed = failed && this.chunks.length === 0;
    this.wake();
  }
  /** Resolves when more audio arrives or the recording ends. */
  changed(): Promise<void> {
    return new Promise((r) => this.waiters.push(r));
  }
  private wake() {
    const w = this.waiters;
    this.waiters = [];
    w.forEach((r) => r());
  }
}

export class VoicePlayer {
  /** Live loudness (0..1) of what is being heard right now, read every animation frame. */
  readonly level: { current: number } = { current: 0 };
  onMouthChange?: (mode: MouthMode) => void;

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  // Recent loudness readings, so the mouth can show what's leaving the speaker, not what's queued.
  private history: { t: number; v: number }[] = [];
  private frame = 0;
  private token = 0;
  private mouth: MouthMode = "off";
  private geminiDownUntil = typeof window === "undefined" ? 0 : loadUntil(DOWN_KEY);
  private geminiSlowUntil = typeof window === "undefined" ? 0 : loadUntil(`${DOWN_KEY}:slow`);
  private lastCancelAt = 0;
  private cache = new Map<string, Recording>();
  private wake: (() => void) | null = null;

  /** Call from a click or key press: browsers only allow audio to start after a user gesture. */
  unlock() {
    if (typeof window === "undefined") return;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext({ latencyHint: "interactive" });
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.analyser.connect(this.ctx.destination);
        this.samples = new Float32Array(this.analyser.fftSize);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      // No Web Audio: the browser voice is used.
    }
  }

  /** Starts generating a line's audio ahead of time (e.g. while the phone rings). */
  prefetch(text: string, opts: SpeakOptions) {
    this.recordingFor(text, opts);
  }

  /** Speaks text. Resolves true when it finished, false when it was stopped or replaced. */
  async speak(text: string, opts: SpeakOptions): Promise<boolean> {
    this.halt();
    const token = ++this.token;
    const recording = this.recordingFor(text.trim(), opts);
    if (recording) {
      const played = await this.playRecording(recording, token);
      if (token !== this.token) return false;
      if (played) return true;
    }
    await this.speakWithBrowser(text.trim(), opts, token);
    return token === this.token;
  }

  /** Stops speaking at once (e.g. the learner talks over the client). */
  stop() {
    this.token++;
    this.halt();
  }

  private halt() {
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* not started */
      }
      s.disconnect();
    }
    this.sources.clear();
    this.cancelBrowserVoice();
    this.setMouth("off");
    this.wake?.();
  }

  /** The audio for a line, cached or newly requested; null when only the browser voice can speak. */
  private recordingFor(text: string, opts: SpeakOptions): Recording | null {
    const key = `${opts.voice}|${opts.tone ?? ""}|${text}`;
    const hit = this.cache.get(key);
    if (hit && !hit.failed) return hit;
    const now = Date.now();
    if (!this.ctx || now < this.geminiDownUntil || now < this.geminiSlowUntil) return null;

    const rec = new Recording();
    this.cache.set(key, rec);
    if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
    void this.download(rec, text, opts);
    return rec;
  }

  private async download(rec: Recording, text: string, opts: SpeakOptions) {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: opts.voice, tone: opts.tone ?? null }),
      });
      if (!res.ok || !res.body) {
        if (res.status === 429 || res.status >= 500) {
          const retry = Number(res.headers.get("retry-after"));
          this.geminiDownUntil = Date.now() + Math.min(retry > 0 ? retry * 1000 : GEMINI_RETRY_MS, MAX_DOWN_MS);
          saveUntil(DOWN_KEY, this.geminiDownUntil);
        }
        return rec.finish(true);
      }
      rec.sampleRate = Number(res.headers.get("x-sample-rate")) || 24_000;
      if (res.headers.get("x-tts-streaming") === "0") {
        rec.streaming = false;
        this.geminiSlowUntil = Date.now() + Math.min(SLOW_RETRY_MS, MAX_DOWN_MS);
        saveUntil(`${DOWN_KEY}:slow`, this.geminiSlowUntil);
      }
      const reader = res.body.getReader();
      // A 16-bit sample can be split across network chunks; carry the odd byte over.
      let carry: Uint8Array | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        let bytes: Uint8Array = value;
        if (carry) {
          const joined = new Uint8Array(carry.length + bytes.length);
          joined.set(carry);
          joined.set(bytes, carry.length);
          bytes = joined;
          carry = null;
        }
        if (bytes.length % 2) {
          carry = bytes.slice(-1);
          bytes = bytes.subarray(0, -1);
        }
        rec.push(pcm16ToFloat(bytes));
      }
      rec.finish();
    } catch {
      rec.finish(true);
    }
  }

  /** Plays a recording as it arrives. Returns false if no audio came at all (use the fallback). */
  private async playRecording(rec: Recording, token: number): Promise<boolean> {
    const ctx = this.ctx!;
    if (ctx.state === "suspended") void ctx.resume();
    let next = 0; // when the next chunk starts, in AudioContext time
    let index = 0;

    // Never keep the learner waiting: no audio within the budget means the browser speaks instead.
    // Audio from a slow model must be complete, or it would stop for seconds mid-sentence.
    const playable = () => rec.done || (rec.streaming && rec.chunks.length > 0);
    if (!playable()) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const budget = new Promise<void>((r) => (timer = setTimeout(r, START_BUDGET_MS)));
      while (!playable() && token === this.token) {
        const waited = await Promise.race([rec.changed().then(() => false), budget.then(() => true), this.interrupted().then(() => false)]);
        if (waited) break;
      }
      clearTimeout(timer);
      if (token !== this.token) return true;
      if (!playable() || !rec.chunks.length) return false;
    }

    while (token === this.token) {
      if (index < rec.chunks.length) {
        const data = rec.chunks[index++];
        const buffer = ctx.createBuffer(1, data.length, rec.sampleRate);
        buffer.copyToChannel(data, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.analyser!);
        source.onended = () => this.sources.delete(source);
        // Start (or restart after a network stall) slightly ahead, then play chunks back to back.
        if (next < ctx.currentTime + 0.02) {
          next = ctx.currentTime + (index === 1 ? START_BUFFER_S : 0.04);
          if (index === 1) this.setMouth("level", next);
        }
        source.start(next);
        next += buffer.duration;
        this.sources.add(source);
        continue;
      }
      if (rec.done) break;
      await Promise.race([rec.changed(), this.interrupted()]);
    }
    if (token !== this.token) return true;
    if (index === 0) return !rec.failed && rec.chunks.length > 0;

    // Wait for the last scheduled audio to be heard.
    const remainingMs = (next - ctx.currentTime + this.outputDelay()) * 1000;
    if (remainingMs > 0) await Promise.race([new Promise((r) => setTimeout(r, remainingMs)), this.interrupted()]);
    if (token === this.token) this.setMouth("off");
    return true;
  }

  private interrupted(): Promise<void> {
    return new Promise((r) => (this.wake = r));
  }

  /** Cancels the browser voice only if it's in use (cancelling idle speech can break Chrome's next line). */
  private cancelBrowserVoice() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) {
      synth.cancel();
      this.lastCancelAt = Date.now();
    }
  }

  /** Says the whole line with the browser's voice: every sentence queued at once, so no gaps. */
  private async speakWithBrowser(text: string, opts: SpeakOptions, token: number): Promise<void> {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const sinceCancel = Date.now() - this.lastCancelAt;
    if (sinceCancel < AFTER_CANCEL_MS) await new Promise((r) => setTimeout(r, AFTER_CANCEL_MS - sinceCancel));
    if (token !== this.token) return;

    const chunks = splitForSpeech(text);
    const voice = pickVoice(synth.getVoices(), opts.locale, opts.gender);

    const attempt = (retry: boolean): Promise<"done" | "stalled"> =>
      new Promise((resolve) => {
        let started = false;
        let settled = false;
        const settle = (result: "done" | "stalled") => {
          if (settled) return;
          settled = true;
          clearTimeout(safety);
          clearTimeout(startCheck);
          resolve(result);
        };
        void this.interrupted().then(() => settle("done"));
        chunks.forEach((chunk, i) => {
          const u = new SpeechSynthesisUtterance(chunk);
          u.lang = voice?.lang ?? opts.locale;
          if (voice) u.voice = voice;
          u.rate = opts.rate ?? 1;
          u.pitch = opts.pitch ?? 1;
          // The mouth moves only while the browser is actually talking.
          u.onstart = () => {
            started = true;
            if (token === this.token) this.setMouth("simulated");
          };
          if (i === chunks.length - 1) u.onend = () => settle("done");
          u.onerror = (e) => {
            if (e.error !== "interrupted" && e.error !== "canceled") settle("done");
          };
          synth.speak(u);
        });
        if (synth.paused) synth.resume();
        // Chrome sometimes accepts an utterance and never says it.
        const startCheck = setTimeout(() => {
          if (!started && retry) settle("stalled");
        }, BROWSER_START_TIMEOUT_MS);
        // Some browsers never fire onend; estimate the duration as a safety net.
        const words = text.split(/\s+/).length;
        const safety = setTimeout(() => settle("done"), (words / (2.4 * (opts.rate ?? 1))) * 1000 + 3000);
      });

    let result = await attempt(true);
    if (result === "stalled" && token === this.token) {
      synth.cancel();
      await new Promise((r) => setTimeout(r, AFTER_CANCEL_MS));
      if (token === this.token) result = await attempt(false);
    }
    if (token === this.token) this.setMouth("off");
  }

  /** Seconds between audio being scheduled and leaving the speaker (large for Bluetooth). */
  private outputDelay(): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    return (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
  }

  /** Switches the mouth mode, optionally at an AudioContext time (when the first sound is heard). */
  private setMouth(mode: MouthMode, at?: number) {
    if (mode === "level") this.startMeter();
    else this.stopMeter();
    const apply = () => {
      if (this.mouth === mode) return;
      this.mouth = mode;
      this.onMouthChange?.(mode);
    };
    if (at !== undefined && this.ctx) {
      const token = this.token;
      const delayMs = Math.max(0, (at - this.ctx.currentTime + this.outputDelay()) * 1000);
      setTimeout(() => {
        // Skip if playback already ended (the meter stops with it).
        if (token === this.token && (mode !== "level" || this.frame)) apply();
      }, delayMs);
    } else apply();
  }

  private startMeter() {
    if (this.frame || !this.analyser || !this.samples || !this.ctx) return;
    const ctx = this.ctx;
    const tick = () => {
      this.analyser!.getFloatTimeDomainData(this.samples!);
      let sum = 0;
      for (const v of this.samples!) sum += v * v;
      const now = ctx.currentTime;
      this.history.push({ t: now, v: Math.min(1, Math.sqrt(sum / this.samples!.length) * 4.5) });
      // Show the loudness from `outputDelay` ago: that's what is coming out of the speaker now.
      const heard = now - this.outputDelay();
      while (this.history.length > 1 && this.history[1].t <= heard) this.history.shift();
      this.level.current = this.history[0].t <= heard ? this.history[0].v : 0;
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stopMeter() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.history = [];
    this.level.current = 0;
  }
}

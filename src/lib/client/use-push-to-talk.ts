"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { voiceErrorMessages, type VoiceErrorKind } from "./use-speech-recognition";

// Minimal typings for the Web Speech API (not in lib.dom for all TS versions).
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const canRecord = () => typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";

/** Why a turn produced no words, so the learner gets advice that fits. */
export type EmptyTurnReason = "short" | "silent" | "unclear" | "failed";

// After letting go, wait at most this long for the browser's last words before sending what we have.
const FINISH_TIMEOUT_MS = 700;
// …or this long when nothing has been heard yet (the first words may still be on their way).
const FINISH_TIMEOUT_EMPTY_MS = 1500;
// The browser stops recognition by itself after silences; restart it at most this often per hold.
const MAX_RESTARTS = 40;
// Keep recording briefly after letting go: people often release on their last syllable.
const RECORD_TAIL_MS = 250;
// Presses shorter than this are taps, not speech.
const MIN_SPEECH_MS = 400;
// Mic loudness (0–1, as shown on the ring) below which the whole hold counts as silence.
const SILENT_PEAK = 0.02;
// Server transcription gets at most a minute of audio.
const MAX_UPLOAD_SECONDS = 60;
const STT_SAMPLE_RATE = 16_000;
// How long to wait for the server's transcript before using the browser's.
const STT_TIMEOUT_MS = 12_000;

/**
 * Hold-to-talk. While the button is held, the browser's speech recognition listens (fast, free)
 * and the mic is also recorded. If the browser hears nothing — Safari, Brave, Firefox, a flaky
 * connection, or a mic the recognizer can't use — the recording is transcribed on the server.
 * The whole turn's transcript is then passed to `onUserTurn` ("" with a reason if nothing was said).
 */
export function usePushToTalk(
  locale: string,
  onUserTurn: (text: string, speechMs: number, reason?: EmptyTurnReason) => void,
  opts: {
    /** Conversation language id (e.g. "hinglish"), so the transcript uses the right script. */
    language: string;
    /** What the client last said: helps tell similar-sounding words apart. */
    context?: () => string | undefined;
  },
) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const [available, setAvailable] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [holding, setHolding] = useState(false);
  // Between letting go and the transcript being ready.
  const [transcribing, setTranscribing] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const connectedRef = useRef(false);
  const holdingRef = useRef(false);
  const recRef = useRef<Recognition | null>(null);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const pressedAtRef = useRef(0);
  const speechMsRef = useRef(0);
  const turnRef = useRef(0);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUserTurnRef = useRef(onUserTurn);
  onUserTurnRef.current = onUserTurn;
  const localeRef = useRef(locale);
  localeRef.current = locale;

  // The recording of the current hold, used when the browser's recognizer comes back empty.
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingRef = useRef<Promise<Blob | null> | null>(null);
  const sttAbortRef = useRef<AbortController | null>(null);

  // The learner's mic loudness for the ring around the talk button. A separate mic stream is
  // opened for this; Android can't share the mic with recognition, so it goes without.
  const micLevelRef = useRef(0);
  const peakRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const meterRef = useRef<{ ctx: AudioContext; frame: number } | null>(null);

  useEffect(() => {
    const hasMic = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    setAvailable(hasMic && (recognitionCtor() !== null || canRecord()));
  }, []);

  const stopMeter = () => {
    if (meterRef.current) {
      cancelAnimationFrame(meterRef.current.frame);
      void meterRef.current.ctx.close().catch(() => undefined);
      meterRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    micLevelRef.current = 0;
  };

  const startMeter = (stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += v * v;
        const level = holdingRef.current ? Math.min(1, Math.sqrt(sum / samples.length) * 9) : 0;
        micLevelRef.current = level;
        if (level > peakRef.current) peakRef.current = level;
        if (meterRef.current) meterRef.current.frame = requestAnimationFrame(tick);
      };
      meterRef.current = { ctx, frame: requestAnimationFrame(tick) };
    } catch {
      // The ring just stays still.
    }
  };

  /** Whether the loudness meter is actually measuring (a suspended AudioContext reads silence). */
  const meterWorks = () => meterRef.current?.ctx.state === "running";

  const startRecording = () => {
    recordingRef.current = null;
    recorderRef.current = null;
    const stream = streamRef.current;
    if (!stream || !canRecord()) return;
    try {
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported?.(t));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recordingRef.current = new Promise((resolve) => {
        rec.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }) : null);
        rec.onerror = () => resolve(null);
      });
      rec.start(250);
      recorderRef.current = rec;
    } catch {
      recordingRef.current = null;
      recorderRef.current = null;
    }
  };

  const stopRecording = (afterMs = 0) => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (!rec || rec.state === "inactive") return;
    const stop = () => {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    };
    if (afterMs > 0) setTimeout(stop, afterMs);
    else stop();
  };

  const clearFinishTimer = () => {
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    finishTimerRef.current = null;
  };

  /** Hands over this turn's words, once. */
  const finish = useCallback((turn: number) => {
    if (turn !== turnRef.current || holdingRef.current) return;
    clearFinishTimer();
    turnRef.current++; // later events from this turn are ignored
    if (recRef.current) {
      recRef.current.onend = null;
      recRef.current.abort();
      recRef.current = null;
    }
    const text = [finalRef.current, interimRef.current].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    finalRef.current = "";
    interimRef.current = "";
    setInterim("");
    const speechMs = speechMsRef.current;
    const recording = recordingRef.current;
    recordingRef.current = null;
    const deliver = (words: string, reason?: EmptyTurnReason) => {
      setTranscribing(false);
      if (connectedRef.current) onUserTurnRef.current(words, speechMs, words ? undefined : reason);
    };

    // Nothing was recorded (old browser): the browser's words are all there is.
    if (!recording) return deliver(text, speechMs < MIN_SPEECH_MS ? "short" : "unclear");
    if (!text && speechMs < MIN_SPEECH_MS) {
      stopRecording();
      return deliver("", "short");
    }
    if (!text && meterWorks() && peakRef.current < SILENT_PEAK) {
      stopRecording();
      return deliver("", "silent");
    }

    // Gemini transcribes the recording: it follows Hinglish and other mixed speech that the
    // browser's single-locale recognizer turns into wrong English words. The browser's text is
    // only the live preview, and the backup if the server can't answer in time.
    setTranscribing(true);
    const ac = new AbortController();
    sttAbortRef.current = ac;
    const timeout = setTimeout(() => ac.abort(), STT_TIMEOUT_MS);
    void (async () => {
      let heard: string | null = null;
      try {
        const blob = await Promise.race([recording, new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
        if (blob && blob.size >= 500) {
          const audio = await toWav(blob).catch(() => blob);
          const form = new FormData();
          form.append("audio", audio, audio.type.includes("wav") ? "turn.wav" : "turn.webm");
          form.append("lang", localeRef.current);
          form.append("language", optsRef.current.language);
          const context = optsRef.current.context?.();
          if (context) form.append("context", context);
          const res = await fetch("/api/stt", { method: "POST", body: form, signal: ac.signal });
          if (res.ok) heard = (((await res.json()) as { text?: string }).text ?? "").trim();
        } else {
          heard = "";
        }
      } catch {
        /* falls back below */
      } finally {
        clearTimeout(timeout);
      }
      // Hung up meanwhile.
      if (!connectedRef.current || sttAbortRef.current !== ac) return;
      sttAbortRef.current = null;
      if (heard) deliver(heard);
      else if (text) deliver(text);
      else deliver("", heard === null ? "failed" : "unclear");
    })();
  }, []);

  const fail = useCallback((kind: VoiceErrorKind) => {
    holdingRef.current = false;
    setHolding(false);
    setTranscribing(false);
    setInterim("");
    turnRef.current++;
    stopRecording();
    recordingRef.current = null;
    setError(voiceErrorMessages[kind]);
  }, []);

  const listen = useCallback(
    (turn: number) => {
      const Ctor = recognitionCtor();
      // No browser recognizer (e.g. Firefox): the recording alone is transcribed on the server.
      if (!Ctor) return recorderRef.current ? undefined : fail("unsupported");
      const isAndroid = /android/i.test(navigator.userAgent);
      // Android can't share the mic between the recording and its recognizer; the recording
      // (transcribed by Gemini) is the more accurate of the two, so it wins.
      if (isAndroid && recorderRef.current) return;
      let restarts = 0;
      // Set when the browser's recognizer can't work here (Brave, offline, unsupported language);
      // the recording takes over, so it isn't restarted.
      let broken = false;

      const launch = () => {
        const rec = new Ctor();
        rec.lang = locale;
        // Android Chrome duplicates results in continuous mode, so it gets single-shot sessions.
        rec.continuous = !isAndroid;
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        rec.onresult = (e) => {
          if (turn !== turnRef.current) return;
          let pending = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) finalRef.current += (finalRef.current ? " " : "") + r[0].transcript.trim();
            else pending += r[0].transcript;
          }
          interimRef.current = pending.trim();
          setInterim([finalRef.current, interimRef.current].filter(Boolean).join(" "));
        };
        rec.onerror = (e) => {
          if (turn !== turnRef.current) return;
          if (e.error === "no-speech" || e.error === "aborted") return; // onend decides what's next
          if (recorderRef.current || recordingRef.current) {
            broken = true;
            return;
          }
          if (e.error === "not-allowed" || e.error === "service-not-allowed") fail("permission");
          else if (e.error === "audio-capture") fail("no-mic");
          else if (e.error === "network") fail("network");
          else if (e.error === "language-not-supported") fail("language");
        };
        rec.onend = () => {
          if (recRef.current === rec) recRef.current = null;
          if (turn !== turnRef.current) return;
          if (holdingRef.current && !broken && restarts++ < MAX_RESTARTS) {
            // Still holding: the browser stopped on its own, so quietly keep listening. Words heard
            // but not yet final are kept, since a new session starts from scratch.
            if (interimRef.current) {
              finalRef.current += (finalRef.current ? " " : "") + interimRef.current;
              interimRef.current = "";
            }
            try {
              launch();
              return;
            } catch {
              /* fall through */
            }
          }
          if (!holdingRef.current) finish(turn);
        };
        recRef.current = rec;
        rec.start();
      };

      try {
        launch();
      } catch {
        if (!recorderRef.current) fail("failed");
      }
    },
    [locale, fail, finish],
  );

  const setLive = (live: boolean) => {
    connectedRef.current = live;
    setConnected(live);
    if (!live) {
      holdingRef.current = false;
      turnRef.current++;
      clearFinishTimer();
      recRef.current?.abort();
      recRef.current = null;
      sttAbortRef.current?.abort();
      sttAbortRef.current = null;
      stopRecording();
      recordingRef.current = null;
      setHolding(false);
      setTranscribing(false);
      setInterim("");
      stopMeter();
    }
  };

  /** Starts the call: asks for the microphone once, so holding the button later starts instantly. */
  const connect = useCallback(async () => {
    if (connectedRef.current) return;
    const Ctor = recognitionCtor();
    if (!Ctor && !canRecord()) {
      setError(voiceErrorMessages.unsupported);
      throw new Error("unsupported");
    }
    setError(null);
    setConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      startMeter(stream);
      setLive(true);
    } catch (err) {
      const name = (err as Error).name;
      setError(name === "NotFoundError" ? voiceErrorMessages["no-mic"] : voiceErrorMessages.permission);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);

  const press = useCallback(() => {
    // Still transcribing the last turn on the server: let it finish first.
    if (!connectedRef.current || holdingRef.current || sttAbortRef.current) return;
    clearFinishTimer();
    // A turn still being finished is sent now, before the new one starts.
    if (recRef.current) {
      recRef.current.onend = null;
      recRef.current.abort();
      recRef.current = null;
      finish(turnRef.current);
      if (sttAbortRef.current) return;
    }
    // This press is a user gesture: wake the loudness meter if the browser suspended it.
    if (meterRef.current?.ctx.state === "suspended") void meterRef.current.ctx.resume().catch(() => undefined);
    setError(null);
    holdingRef.current = true;
    pressedAtRef.current = performance.now();
    peakRef.current = 0;
    finalRef.current = "";
    interimRef.current = "";
    setInterim("");
    setHolding(true);
    startRecording();
    listen(turnRef.current);
  }, [listen, finish]);

  const release = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    speechMsRef.current = Math.round(performance.now() - pressedAtRef.current);
    setHolding(false);
    setTranscribing(true);
    stopRecording(RECORD_TAIL_MS);
    const turn = turnRef.current;
    const rec = recRef.current;
    // With a recording, Gemini does the transcript, so there's no need to wait for the browser's
    // last words; without one, send straight away once everything heard is final.
    if (recordingRef.current || (finalRef.current && !interimRef.current)) {
      finish(turn);
      return;
    }
    if (rec) {
      try {
        rec.stop(); // its onend delivers the turn
      } catch {
        finish(turn);
        return;
      }
    } else {
      finish(turn);
      return;
    }
    // If the browser never reports the end, send what was heard (or fall back to the recording).
    finishTimerRef.current = setTimeout(() => finish(turn), finalRef.current || interimRef.current ? FINISH_TIMEOUT_MS : FINISH_TIMEOUT_EMPTY_MS);
  }, [finish]);

  const disconnect = useCallback(() => setLive(false), []);

  useEffect(() => disconnect, [disconnect]);

  return {
    available,
    micLevelRef,
    connecting,
    connected,
    connectedRef,
    holding,
    transcribing,
    interim,
    error,
    connect,
    disconnect,
    press,
    release,
  };
}

/** Decodes a recording and re-encodes it as 16 kHz mono WAV, which every speech model accepts. */
async function toWav(blob: Blob): Promise<Blob> {
  const w = window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext };
  const Ctx = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
  if (!Ctx) throw new Error("no audio decoding");
  // Decoding resamples to the context's rate.
  const ctx = new Ctx(1, 1, STT_SAMPLE_RATE);
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
  const length = Math.min(audio.length, MAX_UPLOAD_SECONDS * audio.sampleRate);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
  const pcm = new DataView(new ArrayBuffer(44 + length * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => pcm.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  pcm.setUint32(4, 36 + length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  pcm.setUint32(16, 16, true);
  pcm.setUint16(20, 1, true);
  pcm.setUint16(22, 1, true);
  pcm.setUint32(24, audio.sampleRate, true);
  pcm.setUint32(28, audio.sampleRate * 2, true);
  pcm.setUint16(32, 2, true);
  pcm.setUint16(34, 16, true);
  str(36, "data");
  pcm.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    let s = 0;
    for (const ch of channels) s += ch[i];
    s = Math.max(-1, Math.min(1, s / channels.length));
    pcm.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([pcm.buffer], { type: "audio/wav" });
}

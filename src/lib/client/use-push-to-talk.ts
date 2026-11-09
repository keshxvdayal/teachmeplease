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

// After letting go, wait at most this long for the browser's last words before sending what we have.
const FINISH_TIMEOUT_MS = 700;
// …or this long when nothing has been heard yet (the first words may still be on their way).
const FINISH_TIMEOUT_EMPTY_MS = 1500;
// The browser stops recognition by itself after silences; restart it at most this often per hold.
const MAX_RESTARTS = 40;

/**
 * Hold-to-talk with the browser's built-in speech recognition (Chrome, Edge, Safari; no API key).
 * Listening lasts from `press()` until `release()`, restarting quietly when the browser stops on
 * its own. The whole turn's transcript is then passed to `onUserTurn`.
 */
export function usePushToTalk(locale: string, onUserTurn: (text: string, speechMs: number) => void) {
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

  // The learner's mic loudness for the ring around the talk button. A separate mic stream is
  // opened for this; Android can't share the mic with recognition, so it goes without.
  const micLevelRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const meterRef = useRef<{ ctx: AudioContext; frame: number } | null>(null);

  useEffect(() => {
    setAvailable(recognitionCtor() !== null && typeof navigator !== "undefined" && !!navigator.mediaDevices);
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
        micLevelRef.current = holdingRef.current ? Math.min(1, Math.sqrt(sum / samples.length) * 9) : 0;
        if (meterRef.current) meterRef.current.frame = requestAnimationFrame(tick);
      };
      meterRef.current = { ctx, frame: requestAnimationFrame(tick) };
    } catch {
      // The ring just stays still.
    }
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
    const text = [finalRef.current, interimRef.current].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    finalRef.current = "";
    interimRef.current = "";
    setInterim("");
    setTranscribing(false);
    if (connectedRef.current) onUserTurnRef.current(text, speechMsRef.current);
  }, []);

  const fail = useCallback((kind: VoiceErrorKind) => {
    holdingRef.current = false;
    setHolding(false);
    setTranscribing(false);
    setInterim("");
    turnRef.current++;
    setError(voiceErrorMessages[kind]);
  }, []);

  const listen = useCallback(
    (turn: number) => {
      const Ctor = recognitionCtor();
      if (!Ctor) return fail("unsupported");
      const isAndroid = /android/i.test(navigator.userAgent);
      let restarts = 0;

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
          if (e.error === "not-allowed" || e.error === "service-not-allowed") fail("permission");
          else if (e.error === "audio-capture") fail("no-mic");
          else if (e.error === "network") fail("network");
          else if (e.error === "language-not-supported") fail("language");
          // "no-speech" and "aborted" just end this session; onend decides what's next.
        };
        rec.onend = () => {
          if (recRef.current === rec) recRef.current = null;
          if (turn !== turnRef.current) return;
          if (holdingRef.current && restarts++ < MAX_RESTARTS) {
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
        fail("failed");
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
      setHolding(false);
      setTranscribing(false);
      setInterim("");
      stopMeter();
    }
  };

  /** Starts the call: asks for the microphone once, so holding the button later starts instantly. */
  const connect = useCallback(async () => {
    if (connectedRef.current) return;
    if (!recognitionCtor()) {
      setError(voiceErrorMessages.unsupported);
      throw new Error("unsupported");
    }
    setError(null);
    setConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (/android/i.test(navigator.userAgent)) stream.getTracks().forEach((t) => t.stop());
      else {
        streamRef.current = stream;
        startMeter(stream);
      }
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
    if (!connectedRef.current || holdingRef.current) return;
    clearFinishTimer();
    // A turn still being finished is sent now, before the new one starts.
    if (recRef.current) {
      recRef.current.onend = null;
      recRef.current.abort();
      recRef.current = null;
      finish(turnRef.current);
    }
    setError(null);
    holdingRef.current = true;
    pressedAtRef.current = performance.now();
    finalRef.current = "";
    interimRef.current = "";
    setInterim("");
    setHolding(true);
    listen(turnRef.current);
  }, [listen, finish]);

  const release = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    speechMsRef.current = Math.round(performance.now() - pressedAtRef.current);
    setHolding(false);
    setTranscribing(true);
    const turn = turnRef.current;
    const rec = recRef.current;
    // Everything heard is already final: send straight away rather than wait for the browser.
    if (finalRef.current && !interimRef.current) {
      if (rec) {
        rec.onend = null;
        rec.abort();
        recRef.current = null;
      }
      finish(turn);
      return;
    }
    if (rec) {
      try {
        rec.stop(); // its onend delivers the turn
      } catch {
        finish(turn);
      }
    } else {
      finish(turn);
    }
    // If the browser never reports the end, send what was heard.
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

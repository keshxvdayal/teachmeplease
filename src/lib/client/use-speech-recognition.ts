"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typings for the Web Speech API (not in lib.dom for all TS versions).
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type RecognitionCtor = new () => SpeechRecognitionLike;

export type VoiceErrorKind = "permission" | "no-mic" | "no-speech" | "network" | "language" | "unsupported" | "failed";

export const voiceErrorMessages: Record<VoiceErrorKind, string> = {
  permission: "Microphone access is blocked. Allow it in your browser's site settings, or type your reply.",
  "no-mic": "No microphone was found. Check your device, or type your reply.",
  "no-speech": "We didn't catch anything. Tap the mic and try again, or type your reply.",
  network: "Speech recognition needs an internet connection. Check your connection, or type your reply.",
  language: "Your browser can't recognise speech in this language. Please type your reply.",
  unsupported: "Voice input isn't supported in this browser. Try Chrome, or type your reply.",
  failed: "Voice input stopped unexpectedly. Try again, or type your reply.",
};

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface RecognitionOptions {
  /** Hands-free mode: stop automatically after this much silence once the user has spoken. */
  autoStopAfterSilenceMs?: number;
  /** Stop if nothing at all is heard within this time. */
  noSpeechTimeoutMs?: number;
}

/**
 * Push-to-talk or hands-free speech recognition. Final text is delivered via onFinal when the user stops,
 * so it can be edited before sending. Android Chrome duplicates results in continuous mode,
 * so there we run single-shot sessions and restart them while the user is still talking.
 */
export function useSpeechRecognition(
  locale: string,
  onFinal: (text: string) => void,
  onError?: (kind: VoiceErrorKind) => void,
) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<VoiceErrorKind | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);
  const finalRef = useRef("");
  const gotAnythingRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  const onErrorRef = useRef(onError);
  const optionsRef = useRef<RecognitionOptions>({});
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noSpeechTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRef = useRef<() => void>(() => undefined);

  const clearTimers = () => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    if (noSpeechTimer.current) clearTimeout(noSpeechTimer.current);
    silenceTimer.current = noSpeechTimer.current = null;
  };
  onFinalRef.current = onFinal;
  onErrorRef.current = onError;

  useEffect(() => setSupported(getCtor() !== null), []);

  const fail = useCallback((kind: VoiceErrorKind) => {
    clearTimers();
    wantRef.current = false;
    setError(kind);
    setListening(false);
    setInterim("");
    onErrorRef.current?.(kind);
  }, []);

  const finish = useCallback(() => {
    clearTimers();
    setListening(false);
    setInterim("");
    const text = finalRef.current.trim();
    finalRef.current = "";
    if (text) onFinalRef.current(text);
    else if (!gotAnythingRef.current) setError((e) => e ?? "no-speech");
  }, []);

  const start = useCallback((options: RecognitionOptions = {}) => {
    const Ctor = getCtor();
    if (!Ctor) return fail("unsupported");
    if (wantRef.current) return;
    optionsRef.current = options;
    if (options.noSpeechTimeoutMs) {
      noSpeechTimer.current = setTimeout(() => {
        if (!gotAnythingRef.current && !finalRef.current) stopRef.current();
      }, options.noSpeechTimeoutMs);
    }
    setError(null);
    finalRef.current = "";
    gotAnythingRef.current = false;
    wantRef.current = true;

    const isAndroid = /android/i.test(navigator.userAgent);
    let restarts = 0;

    const launch = () => {
      const rec = new Ctor();
      rec.lang = locale;
      rec.continuous = !isAndroid;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => setListening(true);
      rec.onresult = (e) => {
        let interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) {
            finalRef.current += (finalRef.current ? " " : "") + r[0].transcript.trim();
            gotAnythingRef.current = true;
          } else {
            interimText += r[0].transcript;
          }
        }
        setInterim(interimText);
        // Any speech counts as activity: cancel the no-speech timer and restart the silence timer.
        if (noSpeechTimer.current) {
          clearTimeout(noSpeechTimer.current);
          noSpeechTimer.current = null;
        }
        gotAnythingRef.current = gotAnythingRef.current || interimText.trim().length > 0;
        const silence = optionsRef.current.autoStopAfterSilenceMs;
        if (silence) {
          if (silenceTimer.current) clearTimeout(silenceTimer.current);
          silenceTimer.current = setTimeout(() => stopRef.current(), silence);
        }
      };
      rec.onerror = (e) => {
        switch (e.error) {
          case "not-allowed":
          case "service-not-allowed":
            return fail("permission");
          case "audio-capture":
            return fail("no-mic");
          case "network":
            return fail("network");
          case "language-not-supported":
            return fail("language");
          case "no-speech":
            // Reported by finish() if nothing at all was captured.
            return;
          case "aborted":
            return;
          default:
            return fail("failed");
        }
      };
      rec.onend = () => {
        if (wantRef.current && isAndroid && restarts++ < 30) {
          // Keep listening across Android's single-shot sessions until the user taps stop.
          try {
            launch();
            return;
          } catch {
            /* fall through to finish */
          }
        }
        wantRef.current = false;
        recRef.current = null;
        finish();
      };

      recRef.current = rec;
      try {
        rec.start();
      } catch {
        fail("failed");
      }
    };

    launch();
  }, [locale, fail, finish]);

  const stop = useCallback(() => {
    clearTimers();
    wantRef.current = false;
    const rec = recRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        finish();
      }
    } else {
      finish();
    }
  }, [finish]);

  stopRef.current = stop;

  useEffect(
    () => () => {
      clearTimers();
      wantRef.current = false;
      recRef.current?.abort();
    },
    [],
  );

  return { supported, listening, interim, error, clearError: () => setError(null), start, stop };
}

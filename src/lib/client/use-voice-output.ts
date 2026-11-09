"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeminiVoice } from "@/lib/config/voices";
import { VoicePlayer, type MouthMode, type SpeakOptions } from "./voice-player";

export interface VoiceOutputConfig {
  voice: GeminiVoice;
  /** Locale for the browser's fallback voice. */
  locale: string;
  gender: "female" | "male";
  rate?: number;
  pitch?: number;
}

/** Reads the client's lines aloud with Gemini's voice, falling back to the browser's voice. */
export function useVoiceOutput(config: VoiceOutputConfig) {
  const [supported, setSupported] = useState<boolean | null>(null);
  // The line being spoken, from the request until it ends (includes waiting for audio).
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  // What the mouth should do right now: only "level"/"simulated" while sound is actually heard.
  const [mouth, setMouth] = useState<MouthMode>("off");
  const playerRef = useRef<VoicePlayer | null>(null);
  playerRef.current ??= new VoicePlayer();
  const player = playerRef.current;
  const configRef = useRef(config);
  configRef.current = config;

  const options = (tone?: string | null): SpeakOptions => {
    const c = configRef.current;
    return { voice: c.voice, tone, locale: c.locale, gender: c.gender, rate: c.rate, pitch: c.pitch };
  };

  useEffect(() => {
    setSupported(typeof window !== "undefined" && ("AudioContext" in window || "speechSynthesis" in window));
    player.onMouthChange = setMouth;
    // Any first tap or key press on the page unlocks audio for replies that arrive later.
    const unlock = () => player.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      player.onMouthChange = undefined;
      player.stop();
    };
  }, [player]);

  const stop = useCallback(() => {
    player.stop();
    setSpeakingId(null);
  }, [player]);

  /** Speaks a line; onEnd fires once when it finishes naturally (not when stopped). */
  const speak = useCallback(
    (id: string, text: string, onEnd?: () => void, tone?: string | null) => {
      player.unlock();
      setSpeakingId(id);
      void player.speak(text, options(tone)).then((finished) => {
        if (!finished) return;
        setSpeakingId((cur) => (cur === id ? null : cur));
        onEnd?.();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [player],
  );

  /** Starts making a line's audio early, so it plays instantly when spoken. */
  const prefetch = useCallback(
    (text: string, tone?: string | null) => player.prefetch(text, options(tone)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [player],
  );

  return {
    supported,
    speakingId,
    /** True only while the client's voice is actually audible. */
    audible: mouth !== "off",
    /** True while the mouth can follow measured loudness (Gemini audio). */
    measuring: mouth === "level",
    levelRef: player.level,
    speak,
    prefetch,
    stop,
    unlock: () => player.unlock(),
  };
}

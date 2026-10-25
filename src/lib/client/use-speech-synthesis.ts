"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Reads AI replies aloud with the browser's built-in voices. */
export function useSpeechSynthesis(locale: string) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [hasVoiceForLocale, setHasVoiceForLocale] = useState(true);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
      if (voicesRef.current.length) {
        const prefix = locale.split("-")[0].toLowerCase();
        setHasVoiceForLocale(voicesRef.current.some((v) => v.lang.toLowerCase().replace("_", "-").startsWith(prefix)));
      }
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, [locale]);

  const pickVoice = useCallback(() => {
    const voices = voicesRef.current;
    const norm = (l: string) => l.toLowerCase().replace("_", "-");
    const want = norm(locale);
    const prefix = want.split("-")[0];
    const candidates = voices.filter((v) => norm(v.lang) === want);
    const fallback = voices.filter((v) => norm(v.lang).startsWith(prefix));
    const pool = candidates.length ? candidates : fallback;
    // Prefer higher-quality network/"Google" voices when available.
    return pool.find((v) => /google|natural|enhanced|premium/i.test(v.name)) ?? pool[0] ?? null;
  }, [locale]);

  const speak = useCallback(
    (id: string, text: string) => {
      if (!supported) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = locale;
      const voice = pickVoice();
      if (voice) u.voice = voice;
      u.rate = 1;
      u.onstart = () => setSpeakingId(id);
      u.onend = () => setSpeakingId((cur) => (cur === id ? null : cur));
      u.onerror = () => setSpeakingId((cur) => (cur === id ? null : cur));
      setSpeakingId(id);
      synth.speak(u);
    },
    [supported, locale, pickVoice],
  );

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, [supported]);

  return { supported, speakingId, hasVoiceForLocale, speak, stop };
}

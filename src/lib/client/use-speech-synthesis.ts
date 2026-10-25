"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface VoiceProfile {
  gender: "female" | "male";
  rate: number;
  pitch: number;
}

// Browser voice names rarely state gender, so match on well-known names across Chrome, Safari, Edge and Android.
const FEMALE = /female|woman|samantha|karen|moira|tessa|victoria|zira|susan|serena|fiona|allison|ava|kate|libby|sonia|natasha|aria|jenny|veena|lekha|heera|kalpana|swara|neerja|google uk english female|google हिन्दी/i;
const MALE = /\bmale\b|\bman\b|daniel|alex|fred|rishi|david|mark|george|james|oliver|guy|ryan|thomas|aaron|arthur|gordon|lee|hemant|ravi|prabhat|madhur|google uk english male/i;
const QUALITY = /google|natural|neural|enhanced|premium|online/i;

function norm(lang: string) {
  return lang.toLowerCase().replace("_", "-");
}

/** Picks the best installed voice for a locale and character, preferring higher-quality voices. */
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

/** Splits text into sentence-sized chunks; Chrome stops long single utterances after ~15s. */
export function splitForSpeech(text: string, max = 180): string[] {
  const sentences = text.match(/[^.!?।]+[.!?।]+["”']?|[^.!?।]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const chunks: string[] = [];
  for (const s of sentences) {
    const last = chunks[chunks.length - 1];
    if (last && last.length + s.length + 1 <= max) chunks[chunks.length - 1] = `${last} ${s}`;
    else chunks.push(s);
  }
  return chunks;
}

/** Reads AI replies aloud with the browser's built-in voices. */
export function useSpeechSynthesis(locale: string, profile?: VoiceProfile) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [hasVoiceForLocale, setHasVoiceForLocale] = useState(true);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  // Incremented on every speak/stop so callbacks from cancelled speech are ignored.
  const tokenRef = useRef(0);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        setHasVoiceForLocale(voicesRef.current.some((v) => norm(v.lang).startsWith(prefix)));
      }
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      tokenRef.current++;
      window.speechSynthesis.cancel();
    };
  }, [locale]);

  const stop = useCallback(() => {
    tokenRef.current++;
    if (fallbackRef.current) clearTimeout(fallbackRef.current);
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, []);

  /** Speaks text; onEnd fires once when it finishes naturally (not when stopped). */
  const speak = useCallback(
    (id: string, text: string, onEnd?: () => void) => {
      if (!supported) {
        onEnd?.();
        return;
      }
      const synth = window.speechSynthesis;
      const token = ++tokenRef.current;
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
      const wasBusy = synth.speaking || synth.pending;
      synth.cancel();

      let finished = false;
      const done = () => {
        if (finished || token !== tokenRef.current) return;
        finished = true;
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        setSpeakingId(null);
        onEnd?.();
      };

      const voice = pickVoice(voicesRef.current, locale, profile?.gender);
      const chunks = splitForSpeech(text);
      const start = () => {
        if (token !== tokenRef.current) return;
        if (synth.paused) synth.resume();
        chunks.forEach((chunk, i) => {
          const u = new SpeechSynthesisUtterance(chunk);
          u.lang = voice?.lang ?? locale;
          if (voice) u.voice = voice;
          u.rate = profile?.rate ?? 1;
          u.pitch = profile?.pitch ?? 1;
          if (i === chunks.length - 1) u.onend = done;
          u.onerror = (e) => {
            if (e.error !== "interrupted" && e.error !== "canceled") done();
          };
          synth.speak(u);
        });
        setSpeakingId(id);
        // Some browsers never fire onend; estimate the duration as a safety net.
        const words = text.split(/\s+/).length;
        fallbackRef.current = setTimeout(done, (words / (2.4 * (profile?.rate ?? 1))) * 1000 + 3000);
      };
      // Chrome can drop utterances queued in the same tick as cancel().
      if (wasBusy) setTimeout(start, 80);
      else start();
    },
    [supported, locale, profile?.gender, profile?.rate, profile?.pitch],
  );

  return { supported, speakingId, hasVoiceForLocale, speak, stop };
}

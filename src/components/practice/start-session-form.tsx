"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormError, inputClass, Label } from "@/components/ui/field";
import { api, ApiRequestError } from "@/lib/client/api";

interface Lang {
  id: string;
  label: string;
  nativeLabel: string;
  note?: string;
  speechLocales: { tag: string; label: string }[];
}

const LOCALE_KEY = "tmp_speech_locale";

export function StartSessionForm(props: {
  scenarioId: string;
  defaultLanguage: string;
  languages: Lang[];
  personas: Record<string, { name: string; role: string }>;
  isAnonymous: boolean;
  anonSessionsPerDay: number;
}) {
  const router = useRouter();
  const [language, setLanguage] = useState(props.defaultLanguage);
  const lang = props.languages.find((l) => l.id === language) ?? props.languages[0];
  const [speechLocale, setSpeechLocale] = useState(lang.speechLocales[0].tag);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick a sensible accent for English from saved choice or browser locale (still user-editable).
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(`${LOCALE_KEY}:${lang.id}`);
    } catch {
      /* ignore */
    }
    const browser = typeof navigator !== "undefined" ? navigator.language : "";
    const match =
      lang.speechLocales.find((l) => l.tag === saved) ??
      lang.speechLocales.find((l) => l.tag.toLowerCase() === browser.toLowerCase()) ??
      lang.speechLocales[0];
    setSpeechLocale(match.tag);
  }, [lang]);

  async function start() {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      localStorage.setItem(`${LOCALE_KEY}:${lang.id}`, speechLocale);
    } catch {
      /* ignore */
    }
    try {
      const { data } = await api<{ session: { id: string } }>("/api/sessions", {
        method: "POST",
        json: { scenarioId: props.scenarioId, language, speechLocale },
      });
      router.push(`/session/${data.session.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't start the session. Please try again.");
      setStarting(false);
    }
  }

  const persona = props.personas[language];

  return (
    <section className="relative mt-5 rounded-[28px] border border-line bg-surface p-6 shadow-lift sm:p-8" aria-labelledby="setup-heading">
      <h2 id="setup-heading" className="text-2xl font-extrabold">
        Set up your <span className="font-serif font-normal italic text-gradient">session</span>
      </h2>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-ink-2">Conversation language</legend>
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line">
            {props.languages.map((l) => (
              <label
                key={l.id}
                className={`cursor-pointer rounded-xl px-2 py-2.5 text-center text-sm transition-all has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${
                  language === l.id ? "bg-night font-semibold text-white shadow-md" : "text-ink-2 hover:bg-surface hover:text-ink"
                }`}
              >
                <input
                  type="radio"
                  name="language"
                  value={l.id}
                  checked={language === l.id}
                  onChange={() => setLanguage(l.id)}
                  className="sr-only"
                />
                {l.nativeLabel}
              </label>
            ))}
          </div>
          {lang.note && <p className="mt-2 text-xs text-muted">{lang.note}</p>}
        </fieldset>

        <div>
          <Label htmlFor="speech-locale">Voice input accent</Label>
          <select
            id="speech-locale"
            value={speechLocale}
            onChange={(e) => setSpeechLocale(e.target.value)}
            className={inputClass}
            disabled={lang.speechLocales.length < 2}
          >
            {lang.speechLocales.map((l) => (
              <option key={l.tag} value={l.tag}>
                {l.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted">Used for speech recognition only.</p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-2xl bg-brand-soft p-3.5 text-sm text-ink-2">
        <span
          className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-accent to-[#d63a4c] font-display text-sm font-bold text-white"
          aria-hidden
        >
          {persona?.name
            .split(/\s+/)
            .map((p) => p[0])
            .join("")
            .slice(0, 2)}
          <span className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-brand-soft bg-lime" />
        </span>
        <p>
          You&apos;ll be speaking with <strong className="text-ink">{persona?.name}</strong>, {persona?.role}.
        </p>
      </div>

      <div className="mt-4 flex gap-3 rounded-2xl bg-canvas p-4 text-sm text-ink-2 ring-1 ring-line">
        <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        <div className="space-y-1.5">
          <p>
            Your messages are sent to an AI provider to generate replies and feedback. <strong>Don&apos;t use real client names or
            confidential details</strong> — the scenario details are enough.
          </p>
          <p>Voice input uses your browser&apos;s speech features and works best in Chrome. You can always type instead.</p>
          {props.isAnonymous && (
            <p>
              You can practice {props.anonSessionsPerDay} sessions a day without an account. History is saved on this device only —{" "}
              <Link href="/signup" className="font-medium text-brand underline-offset-2 hover:underline">
                create a free account
              </Link>{" "}
              to keep it.
            </p>
          )}
        </div>
      </div>

      <div className="mt-5">
        <FormError>{error}</FormError>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          By starting, you agree to our <Link href="/terms" className="underline underline-offset-2">Terms</Link> and{" "}
          <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
        </p>
        <Button size="lg" onClick={start} disabled={starting}>
          {starting ? "Starting…" : "Start practice"} <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, CheckCircle2, CircleDashed, CircleMinus, Loader2, RotateCcw, Sparkles, TrendingUp, ThumbsUp, Volume2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/field";
import { LocalTime } from "@/components/site/local-time";
import { ScoreRing } from "@/components/ui/score-ring";
import { ScoreBars } from "./score-bars";
import { api, ApiRequestError, trackEvent } from "@/lib/client/api";
import type { SessionView } from "@/lib/sessions/service";

const LANGUAGE_LABELS: Record<string, string> = { en: "English", hi: "Hindi", hinglish: "Hinglish" };
const TTS: Record<string, string> = { hi: "hi-IN", hinglish: "en-IN" };

const goalCopy = {
  yes: { label: "Goal reached", icon: CheckCircle2, tone: "success" as const },
  partly: { label: "Goal partly reached", icon: CircleDashed, tone: "warning" as const },
  no: { label: "Goal not reached", icon: CircleMinus, tone: "danger" as const },
};

export function ResultsView({ initial, isAnonymous }: { initial: SessionView; isAnonymous: boolean }) {
  const [session, setSession] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // Poll while another request is generating the scorecard.
  useEffect(() => {
    if (session.status !== "scoring") return;
    const t = setInterval(async () => {
      try {
        const { data } = await api<{ session: SessionView }>(`/api/sessions/${session.id}`);
        setSession(data.session);
      } catch {
        /* keep polling */
      }
    }, 2500);
    return () => clearInterval(t);
  }, [session.status, session.id]);

  useEffect(() => {
    if (session.status === "scored") trackEvent("scorecard_view", { scenario: session.scenario.id });
  }, [session.status, session.scenario.id]);

  async function retry() {
    setRetrying(true);
    setError(null);
    try {
      const { data } = await api<{ session: SessionView }>(`/api/sessions/${session.id}/scorecard`, { method: "POST" });
      setSession(data.session);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
      const fresh = await api<{ session: SessionView }>(`/api/sessions/${session.id}`).catch(() => null);
      if (fresh) setSession(fresh.data.session);
    } finally {
      setRetrying(false);
    }
  }

  const header = (
    <div>
      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
        <span className="h-px w-6 bg-brand" aria-hidden />
        {session.scenario.title}
      </p>
      <p className="mt-2 text-sm text-muted">
        With {session.scenario.personaName} · {LANGUAGE_LABELS[session.language]} · <LocalTime iso={session.startedAt} />
      </p>
    </div>
  );

  if (session.status === "scoring") {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex flex-col items-center rounded-[28px] border border-line bg-surface px-6 py-20 text-center shadow-card" role="status">
          <span className="relative flex size-16 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-brand/20" aria-hidden />
            <span className="relative flex size-16 items-center justify-center rounded-full bg-linear-to-br from-brand to-[#a13df5] text-white shadow-glow">
              <Sparkles className="size-7" aria-hidden />
            </span>
          </span>
          <p className="mt-6 font-display text-xl font-bold">Reviewing your conversation…</p>
          <p className="mt-1 text-sm text-muted">This usually takes 5–15 seconds.</p>
        </div>
      </div>
    );
  }

  if (session.status === "active") {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-[28px] border border-line bg-surface p-6 shadow-card sm:p-8">
          <h1 className="text-2xl font-extrabold">This practice is still in progress</h1>
          <p className="mt-2 text-ink-2">Finish the conversation to see your feedback.</p>
          <ButtonLink href={`/session/${session.id}`} className="mt-5">
            Continue practice <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (session.status === "scoring_failed") {
    const canRetry = session.scoringAttemptsLeft > 0;
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-[28px] border border-line bg-surface p-6 shadow-card sm:p-8">
          <h1 className="text-2xl font-extrabold">We couldn&apos;t generate your feedback</h1>
          <p className="mt-2 text-ink-2">
            Your conversation is saved.{" "}
            {canRetry ? "This is usually temporary — try again." : "We tried several times without success. Please start a new practice."}
          </p>
          <div className="mt-4">
            <FormError>{error}</FormError>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            {canRetry && (
              <Button onClick={retry} disabled={retrying}>
                {retrying ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
                {retrying ? "Generating…" : "Try again"}
              </Button>
            )}
            <ButtonLink href={`/practice/${session.scenario.id}`} variant="secondary">
              Practice again
            </ButtonLink>
          </div>
        </div>
        <Transcript session={session} open />
      </div>
    );
  }

  if (session.status === "insufficient" || session.status === "abandoned") {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-[28px] border border-line bg-surface p-6 shadow-card sm:p-8">
          <h1 className="text-2xl font-extrabold">
            {session.status === "abandoned" ? "Session ended without feedback" : "Not enough to assess yet"}
          </h1>
          <p className="mt-2 text-ink-2">
            {session.status === "abandoned"
              ? "You ended this practice before there was enough conversation to review."
              : (session.statusDetail ??
                "The conversation didn't give us enough evidence for reliable feedback. Try a longer session that stays on the scenario.")}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink href={`/practice/${session.scenario.id}`}>
              Practice again <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/practice" variant="secondary">
              Choose another scenario
            </ButtonLink>
          </div>
        </div>
        <Transcript session={session} />
      </div>
    );
  }

  const sc = session.scorecard!;
  const goal = goalCopy[sc.goal_achievement];

  return (
    <div className="space-y-6">
      {header}

      <section className="grain relative overflow-hidden rounded-[32px] bg-night p-6 text-white shadow-lift sm:p-8" aria-labelledby="overall">
        <div className="bg-dots-light absolute inset-0" aria-hidden />
        <div className="absolute -right-24 -top-24 size-80 rounded-full bg-brand/50 blur-[90px]" aria-hidden />
        <div className="absolute -bottom-32 left-10 size-72 rounded-full bg-accent/30 blur-[90px]" aria-hidden />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="self-start rounded-full bg-white p-2 shadow-2xl sm:self-auto" role="img" aria-label={`Overall score ${sc.overall_score} out of 10`}>
            <ScoreRing score={sc.overall_score} size={136} stroke={12} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 id="overall" className="text-3xl font-extrabold sm:text-4xl">
              Your <span className="font-serif font-normal italic text-lime">feedback</span>
            </h1>
            <Badge tone={goal.tone} className="mt-3 text-sm">
              <goal.icon className="size-4" aria-hidden /> {goal.label}
            </Badge>
            <p className="mt-4 text-[15px] leading-relaxed text-white/75">{sc.goal_explanation}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 sm:grid-cols-2">
        <section className="rounded-3xl bg-success-soft p-6 ring-1 ring-success/15">
          <h2 className="flex items-center gap-2.5 text-base font-bold text-success">
            <span className="flex size-8 items-center justify-center rounded-xl bg-success text-white">
              <ThumbsUp className="size-4" aria-hidden />
            </span>
            What went well
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink">{sc.what_went_well}</p>
        </section>
        <section className="rounded-3xl bg-accent-soft p-6 ring-1 ring-accent/20">
          <h2 className="flex items-center gap-2.5 text-base font-bold text-accent-ink">
            <span className="flex size-8 items-center justify-center rounded-xl bg-accent text-white">
              <TrendingUp className="size-4" aria-hidden />
            </span>
            What to improve
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink">{sc.what_to_improve}</p>
        </section>
      </div>

      <section className="rounded-[28px] border border-line bg-surface p-6 shadow-card sm:p-8">
        <h2 className="text-2xl font-extrabold">
          Try saying this <span className="font-serif font-normal italic text-gradient">instead</span>
        </h2>
        <div className="mt-5 rounded-2xl bg-canvas p-4 ring-1 ring-line">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Turn {sc.related_turn} — you said</p>
          <p className="mt-1.5 text-[15px] text-ink-2">“{sc.related_user_message}”</p>
        </div>
        <div className="flex justify-center py-1.5" aria-hidden>
          <span className="flex size-8 items-center justify-center rounded-full bg-lime text-ink">
            <ArrowDown className="size-4" />
          </span>
        </div>
        <div className="rounded-2xl bg-linear-to-br from-brand-soft to-[#f6ebff] p-4 ring-1 ring-brand/15 sm:p-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-ink">A stronger version</p>
          <div className="mt-1.5 flex items-start gap-2">
            <p className="flex-1 font-serif text-xl leading-snug text-ink sm:text-2xl">“{sc.better_phrase}”</p>
            <SpeakButton text={sc.better_phrase} lang={TTS[session.language] ?? session.speechLocale ?? "en-US"} />
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-line bg-surface p-6 shadow-card sm:p-8">
        <h2 className="mb-6 text-2xl font-extrabold">Skill breakdown</h2>
        <ScoreBars
          scores={{
            clarity: sc.clarity_score,
            confidence: sc.confidence_score,
            professionalism: sc.professionalism_score,
            objection_handling: sc.objection_handling_score,
            closing_outcome: sc.closing_outcome_score,
          }}
          reasons={sc.score_reasons}
        />
        <p className="mt-6 text-xs text-muted">
          AI-generated practice feedback based on this conversation only. It isn&apos;t a formal or validated assessment of your
          abilities.
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <ButtonLink href={`/practice/${session.scenario.id}`} size="lg">
          <RotateCcw className="size-4" aria-hidden /> Practice again
        </ButtonLink>
        <ButtonLink href="/practice" size="lg" variant="secondary">
          Choose another scenario
        </ButtonLink>
      </div>

      {isAnonymous && (
        <section className="grain relative flex flex-col gap-4 overflow-hidden rounded-3xl bg-linear-to-br from-brand via-[#7c3df2] to-[#c03df0] p-6 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-extrabold">Keep your progress</h2>
            <p className="mt-1 text-sm text-white/80">Create a free account to save this scorecard and track your scores over time.</p>
          </div>
          <ButtonLink href="/signup" variant="inverse" className="shrink-0">
            Create free account
          </ButtonLink>
        </section>
      )}

      <Transcript session={session} />
    </div>
  );
}

function SpeakButton({ text, lang }: { text: string; lang: string }) {
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(typeof window !== "undefined" && "speechSynthesis" in window), []);
  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={() => {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        window.speechSynthesis.speak(u);
      }}
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-brand shadow-card transition-transform hover:scale-105"
      aria-label="Hear this phrase"
    >
      <Volume2 className="size-4" aria-hidden />
    </button>
  );
}

function Transcript({ session, open = false }: { session: SessionView; open?: boolean }) {
  return (
    <details open={open} className="group rounded-3xl border border-line bg-surface shadow-card">
      <summary className="cursor-pointer list-none rounded-3xl px-6 py-5 font-display font-bold marker:hidden">
        <span className="flex items-center justify-between">
          Full transcript
          <span className="rounded-full bg-canvas px-3 py-1 font-sans text-xs font-medium text-muted ring-1 ring-line group-open:hidden">Show</span>
          <span className="hidden rounded-full bg-canvas px-3 py-1 font-sans text-xs font-medium text-muted ring-1 ring-line group-open:inline">Hide</span>
        </span>
      </summary>
      <ol className="space-y-4 border-t border-line px-6 py-5">
        {session.messages.map((m) => (
          <li key={m.id} className="text-[15px] leading-relaxed">
            <span className={`mr-2 text-xs font-semibold uppercase tracking-wide ${m.speaker === "user" ? "text-brand" : "text-muted"}`}>
              {m.speaker === "user" ? `You · turn ${m.turn}` : session.scenario.personaName}
            </span>
            <span className="block text-ink-2">{m.text}</span>
          </li>
        ))}
      </ol>
      <p className="px-6 pb-5 text-xs text-muted">
        <Link href="/history" className="underline underline-offset-2">
          See all your sessions
        </Link>
      </p>
    </details>
  );
}

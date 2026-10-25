import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Quote, Target, UserRound } from "lucide-react";
import { SiteHeader } from "@/components/site/header";
import { Difficulty } from "@/components/ui/difficulty";
import { Badge } from "@/components/ui/badge";
import { StartSessionForm } from "@/components/practice/start-session-form";
import { scenarioTheme } from "@/components/scenario-theme";
import { conversationLanguages } from "@/lib/config/languages";
import { limits } from "@/lib/config/limits";
import { getActor } from "@/lib/auth/identity";
import { getScenario, toPublicScenario } from "@/lib/scenarios";

type Props = { params: Promise<{ scenarioId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = getScenario((await params).scenarioId);
  return { title: s ? `${s.title} briefing` : "Scenario" };
}

export default async function BriefingPage({ params }: Props) {
  const scenario = getScenario((await params).scenarioId);
  if (!scenario || !scenario.is_active) notFound();
  const pub = toPublicScenario(scenario);
  const theme = scenarioTheme(pub.id);
  const Icon = theme.icon;
  const actor = await getActor();

  const languages = conversationLanguages
    .filter((l) => scenario.language_modes.includes(l.id))
    .map((l) => ({ id: l.id, label: l.label, nativeLabel: l.nativeLabel, note: l.note, speechLocales: l.speechLocales }));
  const personas = Object.fromEntries(
    languages.map((l) => {
      const p = toPublicScenario(scenario, l.id);
      return [l.id, { name: p.personaName, role: p.personaRole }];
    }),
  );

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/practice"
          className="inline-flex items-center gap-1.5 rounded-full px-1 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden /> All scenarios
        </Link>

        {/* Hero banner */}
        <div className={`grain relative mt-5 overflow-hidden rounded-[32px] px-6 py-8 sm:px-10 sm:py-12 ${theme.panel}`}>
          <div className="bg-dots-light absolute inset-0 opacity-60" aria-hidden />
          <Icon className="absolute -bottom-10 -right-6 size-56 rotate-[-12deg] text-white/15" strokeWidth={1.1} aria-hidden />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/90 px-3 py-1">
                <Difficulty level={pub.difficulty} />
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-ink-2">
                <Clock className="size-3.5" aria-hidden /> {pub.estimatedDuration} · up to {pub.maxTurns} replies
              </span>
            </div>
            <h1 className={`mt-5 text-4xl font-extrabold sm:text-6xl ${theme.panelText}`}>
              {pub.title}
            </h1>
            <p className={`mt-3 max-w-2xl text-lg ${theme.panelSubtext}`}>{pub.description}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <section className="rounded-3xl border border-line bg-surface p-6 shadow-card">
            <h2 className="flex items-center gap-2.5 text-base font-bold">
              <span className="flex size-8 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <UserRound className="size-4" aria-hidden />
              </span>
              Your situation
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{pub.userRole}</p>
          </section>
          <section className="rounded-3xl border border-line bg-surface p-6 shadow-card">
            <h2 className="flex items-center gap-2.5 text-base font-bold">
              <span className="flex size-8 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                <Target className="size-4" aria-hidden />
              </span>
              Your goal
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{pub.userGoal}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {pub.skills.map((s) => (
                <Badge key={s} tone="brand">
                  {s}
                </Badge>
              ))}
            </div>
          </section>
        </div>

        <section className="relative mt-5 overflow-hidden rounded-3xl bg-night p-6 text-white sm:p-7">
          <Quote className="absolute right-5 top-5 size-14 text-white/10" aria-hidden />
          <p className="text-[11px] font-semibold uppercase tracking-widest text-lime">Fictional AI client</p>
          <p className="relative mt-2 max-w-2xl text-[15px] leading-relaxed text-white/85">{pub.personaDescription}</p>
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {pub.personalityTraits.map((t) => (
              <li key={t} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80">
                {t}
              </li>
            ))}
          </ul>
        </section>

        <StartSessionForm
          scenarioId={pub.id}
          defaultLanguage={pub.defaultLanguage}
          languages={languages}
          personas={personas}
          isAnonymous={actor?.type !== "user"}
          anonSessionsPerDay={limits.anonSessionsPerDay}
        />
      </main>
    </>
  );
}

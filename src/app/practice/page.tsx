import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { ScenarioCard } from "@/components/scenario-card";
import { getActiveScenarios, getTrack, toPublicScenario } from "@/lib/scenarios";

export const metadata: Metadata = { title: "Choose a scenario" };

const TRACK_ID = "client-communication";

export default function PracticePage() {
  const track = getTrack(TRACK_ID);
  const scenarios = getActiveScenarios(TRACK_ID).map((s) => toPublicScenario(s));

  return (
    <>
      <SiteHeader />
      <main id="main" className="relative">
        <div className="pointer-events-none absolute inset-x-0 -top-20 h-[420px] overflow-hidden" aria-hidden>
          <div className="bg-dots mask-fade-y absolute inset-0" />
          <div className="absolute -left-20 top-0 size-80 rounded-full bg-brand/20 blur-[90px]" />
          <div className="absolute right-0 top-10 size-72 rounded-full bg-accent/20 blur-[90px]" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand">
            <span className="h-px w-6 bg-brand" aria-hidden />
            {track?.title}
          </p>
          <h1 className="mt-4 text-4xl font-extrabold sm:text-6xl">
            Choose a <span className="font-serif font-normal italic text-gradient">scenario.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-2">
            The AI plays a fictional client with their own goals. You play the freelancer. Each session is 5–8 turns, then you get
            feedback.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {scenarios.map((s, i) => (
              <div key={s.id} className="grid animate-rise" style={{ animationDelay: `${i * 90}ms` }}>
                <ScenarioCard scenario={s} cta="View briefing" />
              </div>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

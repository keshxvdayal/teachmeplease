import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import { Difficulty } from "@/components/ui/difficulty";
import { scenarioTheme } from "@/components/scenario-theme";
import type { PublicScenario } from "@/lib/scenarios/schema";

export function ScenarioCard({ scenario, cta = "Start practice" }: { scenario: PublicScenario; cta?: string }) {
  const theme = scenarioTheme(scenario.id);
  const Icon = theme.icon;

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-card transition-all duration-300 hover:-translate-y-1.5 ${theme.glow}`}
    >
      {/* Illustrated header */}
      <div className={`grain relative h-44 overflow-hidden ${theme.panel}`} aria-hidden>
        <div className="bg-dots-light absolute inset-0 opacity-60" />
        <Icon className="absolute -bottom-6 -right-6 size-36 rotate-[-12deg] text-white/15 transition-transform duration-500 group-hover:rotate-0 group-hover:scale-110" strokeWidth={1.25} />
        <span className={`absolute left-5 top-5 flex size-11 items-center justify-center rounded-2xl ring-1 backdrop-blur ${theme.iconChip}`}>
          <Icon className="size-5" />
        </span>
        <p
          className={`absolute bottom-5 left-5 right-12 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-[13px] font-medium leading-snug shadow-lg transition-transform duration-300 group-hover:-translate-y-1 ${theme.bubble}`}
        >
          “{theme.hook}”
        </p>
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <Difficulty level={scenario.difficulty} />
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <Clock className="size-3.5" aria-hidden />
            {scenario.estimatedDuration}
          </span>
        </div>
        <h3 className="mt-3 text-xl font-bold">{scenario.title}</h3>
        <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-2">{scenario.description}</p>
        <ul className="mt-4 flex flex-wrap gap-1.5">
          <li className="sr-only">Skills practiced:</li>
          {scenario.skills.map((s) => (
            <li key={s} className="rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-ink-2 ring-1 ring-line">
              {s}
            </li>
          ))}
        </ul>
        <Link
          href={`/practice/${scenario.id}`}
          className="mt-5 inline-flex items-center justify-between gap-1.5 border-t border-line pt-4 text-sm font-semibold text-ink after:absolute after:inset-0 after:rounded-3xl"
        >
          {cta}
          <span className="flex size-9 items-center justify-center rounded-full bg-ink text-white transition-all duration-300 group-hover:rotate-45 group-hover:bg-brand">
            <ArrowUpRight className="size-4" aria-hidden />
          </span>
        </Link>
      </div>
    </article>
  );
}

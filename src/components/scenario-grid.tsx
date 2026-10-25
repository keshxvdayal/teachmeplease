"use client";

import { useState } from "react";
import { ScenarioCard } from "@/components/scenario-card";
import type { PublicScenario } from "@/lib/scenarios/schema";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
] as const;

export function ScenarioGrid({ scenarios }: { scenarios: PublicScenario[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const shown = filter === "all" ? scenarios : scenarios.filter((s) => s.difficulty === filter);

  return (
    <>
      <div role="group" aria-label="Filter by difficulty" className="mt-10 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = f.id === "all" ? scenarios.length : scenarios.filter((s) => s.difficulty === f.id).length;
          if (!count) return null;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                filter === f.id
                  ? "bg-night text-white shadow-card"
                  : "bg-surface text-ink-2 ring-1 ring-line-strong hover:-translate-y-px hover:text-ink"
              }`}
            >
              {f.label} <span className="ml-0.5 tabular-nums opacity-60">{count}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((s, i) => (
          <div key={`${filter}-${s.id}`} className="grid animate-rise" style={{ animationDelay: `${i * 70}ms` }}>
            <ScenarioCard scenario={s} cta="View briefing" />
          </div>
        ))}
      </div>
    </>
  );
}

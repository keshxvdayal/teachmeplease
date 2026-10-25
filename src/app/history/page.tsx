import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Award, BarChart3, Layers } from "lucide-react";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { LocalTime } from "@/components/site/local-time";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { scoreBand } from "@/components/scorecard/score-bars";
import { scenarioTheme } from "@/components/scenario-theme";
import { getActor } from "@/lib/auth/identity";
import { listHistory, type HistoryItem } from "@/lib/sessions/service";

export const metadata: Metadata = { title: "History", robots: { index: false } };

const LANGUAGE_LABELS: Record<string, string> = { en: "English", hi: "Hindi", hinglish: "Hinglish" };

function StatusBadge({ item }: { item: HistoryItem }) {
  if (item.status === "scored") {
    const g = item.goalAchievement;
    return <Badge tone={g === "yes" ? "success" : g === "partly" ? "warning" : "neutral"}>Goal: {g}</Badge>;
  }
  const map: Record<string, { label: string; tone: "neutral" | "brand" | "danger" | "warning" }> = {
    active: { label: "In progress", tone: "brand" },
    scoring: { label: "Generating feedback", tone: "brand" },
    scoring_failed: { label: "Feedback failed", tone: "danger" },
    insufficient: { label: "Too short to score", tone: "neutral" },
    abandoned: { label: "Ended early", tone: "neutral" },
  };
  const s = map[item.status] ?? { label: item.status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export default async function HistoryPage() {
  const actor = await getActor();
  const items = actor ? await listHistory(actor) : [];
  const scored = items.filter((i) => i.overallScore !== null);
  const avg = scored.length ? scored.reduce((s, i) => s + (i.overallScore ?? 0), 0) / scored.length : null;

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-4xl font-extrabold sm:text-5xl">
          Your practice <span className="font-serif font-normal italic text-gradient">history</span>
        </h1>
        {actor?.type !== "user" && (
          <p className="mt-5 rounded-2xl bg-lime-soft p-4 text-sm text-ink-2 ring-1 ring-lime">
            You&apos;re not signed in, so this history is stored for this browser only and may disappear if you clear your browser
            data.{" "}
            <Link href="/signup" className="font-medium text-brand hover:underline">
              Create a free account
            </Link>{" "}
            to keep it across devices.
          </p>
        )}

        {items.length === 0 ? (
          <div className="mt-8 rounded-[28px] border-2 border-dashed border-line-strong bg-surface p-12 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <Layers className="size-6" aria-hidden />
            </span>
            <p className="mt-4 font-display text-xl font-bold">No practice sessions yet</p>
            <p className="mt-1 text-sm text-muted">Your scorecards will appear here.</p>
            <ButtonLink href="/practice" className="mt-5">
              Start practicing
            </ButtonLink>
          </div>
        ) : (
          <>
            {avg !== null && (
              <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {[
                  { label: "Sessions", value: String(items.length), icon: Layers, tile: "bg-surface ring-1 ring-line", chip: "bg-brand-soft text-brand" },
                  { label: "Average score", value: avg.toFixed(1), icon: BarChart3, tile: "bg-night text-white", chip: "bg-white/10 text-lime" },
                  {
                    label: "Latest score",
                    value: scored[0].overallScore?.toFixed(1),
                    icon: Award,
                    tile: "col-span-2 bg-lime sm:col-span-1",
                    chip: "bg-ink/10 text-ink",
                  },
                ].map((t) => (
                  <div key={t.label} className={`rounded-3xl p-5 shadow-card ${t.tile}`}>
                    <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-70">
                      <span className={`flex size-7 items-center justify-center rounded-lg ${t.chip}`}>
                        <t.icon className="size-3.5" aria-hidden />
                      </span>
                      {t.label}
                    </dt>
                    <dd className="mt-3 font-display text-4xl font-extrabold tabular-nums">{t.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <ul className="mt-6 space-y-3">
              {items.map((item) => {
                const theme = scenarioTheme(item.scenarioId);
                const Icon = theme.icon;
                return (
                  <li key={item.id}>
                    <Link
                      href={item.status === "active" ? `/session/${item.id}` : `/session/${item.id}/results`}
                      className="group flex items-center gap-4 rounded-3xl border border-line bg-surface p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift sm:p-5"
                    >
                      <span className={`hidden size-12 shrink-0 items-center justify-center rounded-2xl sm:flex ${theme.panel} ${theme.panelText}`} aria-hidden>
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-lg font-bold">{item.scenarioTitle}</p>
                        <p className="mt-0.5 text-sm text-muted">
                          <LocalTime iso={item.startedAt} /> · {LANGUAGE_LABELS[item.language] ?? item.language} · {item.userTurns}{" "}
                          {item.userTurns === 1 ? "reply" : "replies"}
                        </p>
                        <div className="mt-2">
                          <StatusBadge item={item} />
                        </div>
                      </div>
                      {item.overallScore !== null && (
                        <p className={`rounded-2xl px-3 py-2 text-center tabular-nums ${scoreBand(item.overallScore).chip}`}>
                          <span className="font-display text-2xl font-extrabold">{item.overallScore.toFixed(1)}</span>
                          <span className="text-xs opacity-70">/10</span>
                        </p>
                      )}
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-canvas text-ink ring-1 ring-line transition-all group-hover:rotate-45 group-hover:bg-ink group-hover:text-white">
                        <ArrowUpRight className="size-4" aria-hidden />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

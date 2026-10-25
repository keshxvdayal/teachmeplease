import { DIMENSIONS, DIMENSION_LABELS, type Dimension } from "@/lib/scoring/dimensions";

export function scoreBand(score: number): { label: string; tone: string; chip: string } {
  if (score >= 9) return { label: "Excellent", tone: "bg-linear-to-r from-emerald-500 to-lime-400", chip: "bg-success-soft text-success" };
  if (score >= 7) return { label: "Strong", tone: "bg-linear-to-r from-emerald-600 to-emerald-400", chip: "bg-success-soft text-success" };
  if (score >= 5) return { label: "Developing", tone: "bg-linear-to-r from-brand to-[#a13df5]", chip: "bg-brand-soft text-brand-ink" };
  if (score >= 3) return { label: "Needs work", tone: "bg-linear-to-r from-amber-500 to-accent", chip: "bg-warning-soft text-warning" };
  return { label: "Needs work", tone: "bg-linear-to-r from-danger to-accent", chip: "bg-danger-soft text-danger" };
}

export function ScoreBars({
  scores,
  reasons,
  compact = false,
}: {
  scores: Record<Dimension, number>;
  reasons?: Partial<Record<Dimension, string>>;
  compact?: boolean;
}) {
  return (
    <dl className={compact ? "space-y-2.5" : "space-y-5"}>
      {DIMENSIONS.map((d, i) => {
        const s = scores[d];
        const band = scoreBand(s);
        return (
          <div key={d}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className={`font-medium text-ink ${compact ? "text-xs" : "text-sm"}`}>{DIMENSION_LABELS[d]}</dt>
              <dd className={`flex items-center gap-2 tabular-nums text-ink-2 ${compact ? "text-xs" : "text-sm"}`}>
                {!compact && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${band.chip}`}>{band.label}</span>}
                <span>
                  <span className="font-semibold text-ink">{s}</span>/10
                </span>
              </dd>
            </div>
            <div
              className={`mt-1.5 overflow-hidden rounded-full bg-ink/[0.06] ${compact ? "h-1.5" : "h-2.5"}`}
              role="meter"
              aria-label={`${DIMENSION_LABELS[d]} score`}
              aria-valuemin={1}
              aria-valuemax={10}
              aria-valuenow={s}
            >
              <div
                className={`h-full rounded-full animate-bar ${band.tone}`}
                style={{ width: `${s * 10}%`, animationDelay: `${i * 90}ms` }}
              />
            </div>
            {!compact && reasons?.[d] && <p className="mt-2 text-sm leading-relaxed text-muted">{reasons[d]}</p>}
          </div>
        );
      })}
    </dl>
  );
}

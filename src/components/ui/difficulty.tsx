const labels = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" } as const;
const bars = { beginner: 1, intermediate: 2, advanced: 3 } as const;

/** Difficulty of the scenario (not of the user). Uses bars plus text so it isn't colour-only. */
export function Difficulty({ level }: { level: keyof typeof labels }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2">
      <span aria-hidden className="flex items-end gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`w-1 rounded-sm ${i <= bars[level] ? "bg-ink-2" : "bg-line-strong"}`} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      {labels[level]}
    </span>
  );
}

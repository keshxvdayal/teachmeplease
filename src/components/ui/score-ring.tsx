/** Circular overall-score gauge (1–10). Purely presentational; the number is also given as text. */
export function ScoreRing({ score, size = 132, stroke = 11, label = "/10" }: { score: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(10, score)) / 10);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id="score-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5b3df5" />
            <stop offset="0.55" stopColor="#a13df5" />
            <stop offset="1" stopColor="#ff6a3d" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-ink/[0.07]" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#score-ring-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="animate-ring"
          style={{ "--ring-circ": `${circ}px` } as React.CSSProperties}
        />
      </svg>
      <p className="absolute inset-0 flex flex-col items-center justify-center tabular-nums">
        <span className="font-display font-bold leading-none tracking-tight" style={{ fontSize: size * 0.3 }}>
          {score.toFixed(1)}
        </span>
        <span className="mt-0.5 text-xs font-medium text-muted">{label}</span>
      </p>
    </div>
  );
}

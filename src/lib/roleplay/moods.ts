// Client mood scale, from hardest to easiest. No runtime deps so client components can import it.
export const MOODS = ["frustrated", "skeptical", "neutral", "warming", "cooperative"] as const;
export type Mood = (typeof MOODS)[number];

export const MOOD_LABELS: Record<Mood, string> = {
  frustrated: "Frustrated",
  skeptical: "Skeptical",
  neutral: "Neutral",
  warming: "Warming up",
  cooperative: "Cooperative",
};

export function isMood(v: unknown): v is Mood {
  return typeof v === "string" && (MOODS as readonly string[]).includes(v);
}

/** Moods move at most one step per turn, so a client can't flip from frustrated to cooperative instantly. */
export function stepMood(previous: Mood, proposed: Mood): Mood {
  const from = MOODS.indexOf(previous);
  const to = MOODS.indexOf(proposed);
  if (Math.abs(to - from) <= 1) return proposed;
  return MOODS[from + Math.sign(to - from)];
}

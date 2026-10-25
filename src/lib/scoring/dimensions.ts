// Kept free of runtime dependencies so client components can import it cheaply.
export const DIMENSIONS = ["clarity", "confidence", "professionalism", "objection_handling", "closing_outcome"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  clarity: "Clarity",
  confidence: "Confidence",
  professionalism: "Professionalism",
  objection_handling: "Objection handling",
  closing_outcome: "Closing & outcome",
};

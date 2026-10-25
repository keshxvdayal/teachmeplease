import { z } from "zod";
import type { JsonSchema } from "@/lib/ai";

import { DIMENSIONS, type Dimension } from "./dimensions";

export { DIMENSIONS, DIMENSION_LABELS, type Dimension } from "./dimensions";

const score = z.number().int().min(1).max(10);
const sentence = z.string().trim().min(3).max(400);

/** What the model must return. */
export const modelScorecardSchema = z.object({
  insufficient_evidence: z.boolean(),
  clarity_score: score,
  confidence_score: score,
  professionalism_score: score,
  objection_handling_score: score,
  closing_outcome_score: score,
  score_reasons: z.object({
    clarity: sentence,
    confidence: sentence,
    professionalism: sentence,
    objection_handling: sentence,
    closing_outcome: sentence,
  }),
  what_went_well: sentence,
  what_to_improve: sentence,
  better_phrase: z.string().trim().min(3).max(500),
  related_turn: z.number().int().min(1),
  goal_achievement: z.enum(["yes", "partly", "no"]),
  goal_explanation: sentence,
});
export type ModelScorecard = z.infer<typeof modelScorecardSchema>;

/** What we store and display. */
export const scorecardSchema = modelScorecardSchema.omit({ insufficient_evidence: true }).extend({
  overall_score: z.number().min(1).max(10),
  related_user_message: z.string(),
  scoring_version: z.string(),
  model: z.string(),
});
export type Scorecard = z.infer<typeof scorecardSchema>;

const reason: JsonSchema = { type: "string", description: "One sentence citing evidence from the transcript." };
const int = (description: string): JsonSchema => ({ type: "integer", description });

export const scorecardJsonSchema: JsonSchema = {
  type: "object",
  properties: {
    insufficient_evidence: {
      type: "boolean",
      description: "True if the transcript is too short or off-topic to assess the user fairly.",
    },
    clarity_score: int("1-10"),
    confidence_score: int("1-10"),
    professionalism_score: int("1-10"),
    objection_handling_score: int("1-10"),
    closing_outcome_score: int("1-10"),
    score_reasons: {
      type: "object",
      properties: {
        clarity: reason,
        confidence: reason,
        professionalism: reason,
        objection_handling: reason,
        closing_outcome: reason,
      },
      required: [...DIMENSIONS],
    },
    what_went_well: { type: "string", description: "One specific sentence referencing what the user actually said." },
    what_to_improve: { type: "string", description: "One specific, actionable sentence." },
    better_phrase: { type: "string", description: "Exact words the user could have said instead, in the conversation language." },
    related_turn: { type: "integer", description: "User turn number (from the transcript labels) the better phrase replaces." },
    goal_achievement: { type: "string", enum: ["yes", "partly", "no"] },
    goal_explanation: { type: "string", description: "One or two sentences explaining the goal result." },
  },
  required: [
    "insufficient_evidence",
    "clarity_score",
    "confidence_score",
    "professionalism_score",
    "objection_handling_score",
    "closing_outcome_score",
    "score_reasons",
    "what_went_well",
    "what_to_improve",
    "better_phrase",
    "related_turn",
    "goal_achievement",
    "goal_explanation",
  ],
};

/** Overall score is always derived in code: the mean of the five criteria, one decimal. */
export function computeOverall(s: Pick<ModelScorecard, `${Dimension}_score`>): number {
  const total = DIMENSIONS.reduce((sum, d) => sum + s[`${d}_score`], 0);
  return Math.round((total / DIMENSIONS.length) * 10) / 10;
}

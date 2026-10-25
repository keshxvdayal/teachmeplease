import { limits } from "@/lib/config/limits";
import type { ConversationLanguage } from "@/lib/config/languages";
import type { Scenario } from "@/lib/scenarios/schema";
import { AppError } from "@/lib/errors";
import { callModel, type ActorType } from "@/lib/usage/tracking";
import { buildScoringSystemPrompt, formatTranscript, SCORING_VERSION, type ScoringMessage } from "./prompt";
import { computeOverall, modelScorecardSchema, scorecardJsonSchema, scorecardSchema, type Scorecard } from "./schema";

export type ScoringOutcome =
  | { kind: "scored"; scorecard: Scorecard }
  | { kind: "insufficient"; reason: string };

/** Validates raw model output and turns it into a stored scorecard. Returns null if invalid. */
export function buildScorecard(raw: string, messages: ScoringMessage[], model: string): ScoringOutcome | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = modelScorecardSchema.safeParse(json);
  if (!parsed.success) return null;
  const m = parsed.data;

  if (m.insufficient_evidence) {
    return { kind: "insufficient", reason: m.goal_explanation };
  }

  const userMessages = messages.filter((x) => x.speaker === "user");
  // The model must point at a real user turn; otherwise fall back to the closest valid one.
  const related =
    userMessages.find((x) => x.turn === m.related_turn) ??
    userMessages[Math.min(userMessages.length, Math.max(1, m.related_turn)) - 1];
  if (!related) return null;

  const { insufficient_evidence: _ignored, ...rest } = m;
  const scorecard = scorecardSchema.parse({
    ...rest,
    related_turn: related.turn,
    related_user_message: related.text,
    overall_score: computeOverall(m),
    scoring_version: SCORING_VERSION,
    model,
  });
  return { kind: "scored", scorecard };
}

export async function generateScorecard(args: {
  scenario: Scenario;
  language: ConversationLanguage;
  messages: ScoringMessage[];
  hintsUsed?: number;
  sessionId: string;
  actorType: ActorType;
}): Promise<ScoringOutcome> {
  const ctx = { kind: "scoring" as const, actorType: args.actorType, sessionId: args.sessionId };
  const request = {
    system: buildScoringSystemPrompt(args.scenario, args.language),
    turns: [{ role: "user" as const, text: formatTranscript(args.scenario, args.language, args.messages, args.hintsUsed ?? 0) }],
    temperature: 0.2,
    maxOutputTokens: 4096,
    timeoutMs: limits.scoringTimeoutMs,
    jsonSchema: scorecardJsonSchema,
    thinkingBudget: 1024,
  };

  // One retry if the model's JSON fails validation.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await callModel(ctx, request);
    const outcome = buildScorecard(result.text, args.messages, result.model);
    if (outcome) return outcome;
  }
  throw new AppError("ai_invalid_response", "We couldn't generate a valid scorecard. Your transcript is saved — please try again.");
}

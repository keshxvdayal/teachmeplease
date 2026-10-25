import { describe, expect, it } from "vitest";
import { buildScorecard } from "@/lib/scoring/engine";
import { computeOverall } from "@/lib/scoring/schema";
import { validScorecard } from "./helpers/fake-provider";

const messages = [
  { speaker: "ai" as const, text: "Too expensive.", turn: 0 },
  { speaker: "user" as const, text: "I can do 20% off.", turn: 1 },
  { speaker: "ai" as const, text: "Can you go lower?", turn: 1 },
  { speaker: "user" as const, text: "OK, 30% then.", turn: 2 },
  { speaker: "ai" as const, text: "Deal.", turn: 2 },
];

describe("scorecard validation", () => {
  it("accepts a valid scorecard and computes the overall score in code", () => {
    const out = buildScorecard(validScorecard(), messages, "m");
    expect(out?.kind).toBe("scored");
    if (out?.kind !== "scored") return;
    expect(out.scorecard.overall_score).toBe(6.2); // (7+6+9+5+4)/5
    expect(out.scorecard.related_user_message).toBe("OK, 30% then.");
    expect(out.scorecard.scoring_version).toBeDefined();
  });

  it("ignores any overall score the model invents", () => {
    const out = buildScorecard(validScorecard({ overall_score: 10 }), messages, "m");
    expect(out?.kind === "scored" && out.scorecard.overall_score).toBe(6.2);
  });

  it.each([
    ["out of range", { clarity_score: 11 }],
    ["zero", { confidence_score: 0 }],
    ["non-integer", { professionalism_score: 7.5 }],
    ["bad enum", { goal_achievement: "maybe" }],
    ["missing field", { what_to_improve: undefined }],
    ["empty feedback", { what_went_well: "" }],
  ])("rejects %s", (_name, over) => {
    expect(buildScorecard(validScorecard(over), messages, "m")).toBeNull();
  });

  it("rejects non-JSON", () => {
    expect(buildScorecard("Great job!", messages, "m")).toBeNull();
  });

  it("returns insufficient when the model says evidence is lacking", () => {
    const out = buildScorecard(validScorecard({ insufficient_evidence: true, goal_explanation: "Too short to judge." }), messages, "m");
    expect(out).toEqual({ kind: "insufficient", reason: "Too short to judge." });
  });

  it("maps a non-existent related_turn to a real user turn", () => {
    const out = buildScorecard(validScorecard({ related_turn: 9 }), messages, "m");
    expect(out?.kind === "scored" && out.scorecard.related_turn).toBe(2);
  });

  it("computeOverall rounds to one decimal", () => {
    expect(
      computeOverall({ clarity_score: 7, confidence_score: 7, professionalism_score: 8, objection_handling_score: 6, closing_outcome_score: 6 }),
    ).toBe(6.8);
  });
});

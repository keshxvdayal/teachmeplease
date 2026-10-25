import { LLMError, type GenerateRequest, type GenerateResult, type LLMProvider } from "@/lib/ai";

type Step = string | LLMError | ((req: GenerateRequest) => string);

/** Scripted LLM: returns queued outputs in order, or a default roleplay reply. */
export class FakeProvider implements LLMProvider {
  readonly name = "fake";
  readonly model = "fake-model";
  readonly calls: GenerateRequest[] = [];
  private queue: Step[] = [];

  push(...steps: Step[]) {
    this.queue.push(...steps);
    return this;
  }

  estimateCostUsd() {
    return 0.0001;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    this.calls.push(req);
    const step = this.queue.shift() ?? JSON.stringify({ reply: "That's still too expensive for us.", end_conversation: false });
    if (step instanceof LLMError) throw step;
    const text = typeof step === "function" ? step(req) : step;
    return { text, model: this.model, inputTokens: 100, outputTokens: 20, latencyMs: 5 };
  }
}

export const validScorecard = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    insufficient_evidence: false,
    clarity_score: 7,
    confidence_score: 6,
    professionalism_score: 9,
    objection_handling_score: 5,
    closing_outcome_score: 4,
    score_reasons: {
      clarity: "You stated the price clearly.",
      confidence: "You held the price once.",
      professionalism: "Polite throughout.",
      objection_handling: "You conceded before asking about budget.",
      closing_outcome: "No next step was agreed.",
    },
    what_went_well: "You stayed calm when the client compared you to a cheaper quote.",
    what_to_improve: "Ask which part of the proposal exceeds the budget before offering a discount.",
    better_phrase: "Which part of the proposal matters most to you this quarter?",
    related_turn: 2,
    goal_achievement: "partly",
    goal_explanation: "You protected some value but ended without a next step.",
    ...over,
  });

// Provider-neutral contract. Everything outside src/lib/ai talks to this, never to a vendor SDK.

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/** Minimal JSON-schema subset that maps cleanly onto every major provider's structured output. */
export type JsonSchema =
  | { type: "string"; enum?: string[]; description?: string }
  | { type: "integer" | "number"; description?: string }
  | { type: "boolean"; description?: string }
  | { type: "array"; items: JsonSchema; description?: string }
  | { type: "object"; properties: Record<string, JsonSchema>; required: string[]; description?: string };

export interface GenerateRequest {
  system: string;
  turns: ChatTurn[];
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  /** When set, the provider must return JSON matching this schema. */
  jsonSchema?: JsonSchema;
  /** Internal reasoning token budget for models that support it. 0 disables it. */
  thinkingBudget?: number;
}

export interface GenerateResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export type LLMErrorCode = "rate_limited" | "timeout" | "unavailable" | "invalid_response" | "blocked" | "config";

export class LLMError extends Error {
  constructor(
    readonly code: LLMErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  generate(req: GenerateRequest): Promise<GenerateResult>;
  /** Estimated USD cost for planning purposes (free-tier usage is billed at 0 by the provider). */
  estimateCostUsd(inputTokens: number, outputTokens: number): number;
}

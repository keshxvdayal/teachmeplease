import { db } from "@/lib/db";
import { limits } from "@/lib/config/limits";
import { AppError } from "@/lib/errors";
import { startOfUtcDay, secondsUntilUtcMidnight } from "@/lib/time";
import { getProvider, LLMError, type GenerateRequest, type GenerateResult } from "@/lib/ai";

export type UsageKind = "roleplay" | "scoring";
export type ActorType = "anonymous" | "user";

interface CallContext {
  kind: UsageKind;
  actorType: ActorType;
  sessionId: string;
}

/**
 * Every LLM call goes through here: enforces the app-wide daily ceiling, records tokens,
 * latency and estimated cost, and converts provider errors into user-facing AppErrors.
 */
export async function callModel(ctx: CallContext, req: GenerateRequest): Promise<GenerateResult> {
  const provider = getProvider();

  const usedToday = await db.usageEvent.count({ where: { createdAt: { gte: startOfUtcDay() } } });
  if (usedToday >= limits.globalAiRequestsPerDay) {
    throw new AppError(
      "limit_reached",
      "TeachMePlease has reached today's practice capacity. Please come back tomorrow.",
      { retryAfterSeconds: secondsUntilUtcMidnight() },
    );
  }

  try {
    const result = await withOneRetry(() => provider.generate(req));
    await record(ctx, provider.name, result.model, true, null, result, provider.estimateCostUsd(result.inputTokens, result.outputTokens));
    return result;
  } catch (err) {
    const code = err instanceof LLMError ? err.code : "unavailable";
    await record(ctx, provider.name, provider.model, false, code, null, 0);
    throw toAppError(err);
  }
}

/** Retries once on transient overload (not on rate limits — those need a real pause). */
async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof LLMError && err.code === "unavailable") {
      await new Promise((r) => setTimeout(r, 800));
      return fn();
    }
    throw err;
  }
}

async function record(
  ctx: CallContext,
  provider: string,
  model: string,
  ok: boolean,
  errorCode: string | null,
  result: GenerateResult | null,
  estCostUsd: number,
) {
  try {
    await db.usageEvent.create({
      data: {
        kind: ctx.kind,
        actorType: ctx.actorType,
        sessionId: ctx.sessionId,
        provider,
        model,
        ok,
        errorCode,
        inputTokens: result?.inputTokens ?? 0,
        outputTokens: result?.outputTokens ?? 0,
        latencyMs: result?.latencyMs ?? 0,
        estCostUsd,
      },
    });
  } catch (e) {
    console.error("[usage] failed to record usage event", (e as Error).message);
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof LLMError) {
    switch (err.code) {
      case "rate_limited":
        return new AppError("ai_rate_limited", "The AI is getting a lot of requests right now. Your conversation is saved — try again in a few seconds.", {
          retryAfterSeconds: Math.min(err.retryAfterSeconds ?? 15, 60),
        });
      case "timeout":
        return new AppError("ai_timeout", "The AI took too long to respond. Your conversation is saved — please try again.");
      case "invalid_response":
      case "blocked":
        return new AppError("ai_invalid_response", "The AI returned an unexpected response. Please try again.");
      case "config":
        console.error("[ai] provider configuration error:", err.message);
        return new AppError("ai_unavailable", "The AI service isn't configured correctly. Please try again later.");
      default:
        return new AppError("ai_unavailable", "The AI service is temporarily unavailable. Your conversation is saved — please try again.");
    }
  }
  return new AppError("server_error", "Something went wrong. Please try again.");
}

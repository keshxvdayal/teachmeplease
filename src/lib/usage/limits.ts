import { db } from "@/lib/db";
import { limits } from "@/lib/config/limits";
import { getPlan } from "@/lib/config/plans";
import { AppError } from "@/lib/errors";
import { ownedBy, type Actor } from "@/lib/auth/identity";
import { startOfUtcDay, secondsUntilUtcMidnight } from "@/lib/time";

// Empty sessions (only the opening line) cost nothing but are still capped to stop spam.
const MAX_CREATED_SESSIONS_PER_DAY = 30;

function limitError(message: string) {
  return new AppError("limit_reached", message, { retryAfterSeconds: secondsUntilUtcMidnight() });
}

export function sessionsPerDayFor(actor: Actor): number {
  if (actor.type === "anonymous") return limits.anonSessionsPerDay;
  return getPlan(actor.planId).entitlements.sessionsPerDay ?? limits.userSessionsPerDay;
}

export async function assertCanStartSession(actor: Actor, ipHash: string): Promise<void> {
  const since = startOfUtcDay();
  const mine = { ...ownedBy(actor), startedAt: { gte: since } };

  const [practiced, created] = await Promise.all([
    db.practiceSession.count({ where: { ...mine, userTurns: { gt: 0 } } }),
    db.practiceSession.count({ where: mine }),
  ]);

  if (created >= MAX_CREATED_SESSIONS_PER_DAY) throw limitError("You've started a lot of sessions today. Please try again tomorrow.");

  if (practiced >= sessionsPerDayFor(actor)) {
    throw limitError(
      actor.type === "anonymous"
        ? "You've used today's free practice sessions. Create a free account for more, or come back tomorrow."
        : "You've reached today's practice limit. Your limit resets at midnight UTC.",
    );
  }

  if (actor.type === "anonymous") {
    const fromIp = await db.practiceSession.count({
      where: { ipHash, userId: null, userTurns: { gt: 0 }, startedAt: { gte: since } },
    });
    if (fromIp >= limits.anonSessionsPerIpPerDay) {
      throw limitError("Today's free sessions from this network have been used. Create a free account to keep practicing.");
    }
  }
}

export async function assertCanSendMessage(actor: Actor): Promise<void> {
  const sent = await db.message.count({
    where: { speaker: "user", createdAt: { gte: startOfUtcDay() }, session: ownedBy(actor) },
  });
  if (sent >= limits.messagesPerDay) throw limitError("You've reached today's message limit. It resets at midnight UTC.");
}

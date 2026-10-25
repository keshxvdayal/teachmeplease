import { db } from "@/lib/db";
import { retention } from "@/lib/config/limits";

/** Deletes data past its retention period. Run daily (see README). */
export async function runCleanup(now = new Date()) {
  const day = 86_400_000;
  const anonCutoff = new Date(now.getTime() - retention.anonymousDays * day);
  const userCutoff = new Date(now.getTime() - retention.userDays * day);

  const [anonSessions, userSessions, visitors, authSessions, usage, events] = await db.$transaction([
    db.practiceSession.deleteMany({ where: { userId: null, startedAt: { lt: anonCutoff } } }),
    db.practiceSession.deleteMany({ where: { userId: { not: null }, startedAt: { lt: userCutoff } } }),
    db.anonymousVisitor.deleteMany({ where: { createdAt: { lt: anonCutoff }, sessions: { none: {} } } }),
    db.authSession.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.usageEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 400 * day) } } }),
    db.analyticsEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 400 * day) } } }),
  ]);
  return {
    anonymousSessions: anonSessions.count,
    userSessions: userSessions.count,
    anonymousVisitors: visitors.count,
    expiredAuthSessions: authSessions.count,
    usageEvents: usage.count,
    analyticsEvents: events.count,
  };
}

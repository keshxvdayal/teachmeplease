import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// Allow-list keeps analytics free of arbitrary (possibly personal) data.
export const ANALYTICS_EVENTS = [
  "landing_view",
  "practice_start",
  "session_completed",
  "scorecard_view",
  "voice_failure",
  "ai_failure",
  "waitlist_join",
  "signup",
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export async function track(
  name: AnalyticsEventName,
  actorType: "anonymous" | "user" | "unknown",
  props?: Record<string, string | number | boolean>,
): Promise<void> {
  try {
    await db.analyticsEvent.create({ data: { name, actorType, props: (props ?? undefined) as Prisma.InputJsonValue } });
  } catch (e) {
    console.error("[analytics] failed to record event", (e as Error).message);
  }
}

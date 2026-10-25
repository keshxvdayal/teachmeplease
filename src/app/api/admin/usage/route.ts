import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertAdmin, errorResponse } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Basic usage and cost counts for the last N days (default 7). */
export async function GET(req: Request) {
  try {
    assertAdmin(req);
    const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 7));
    const since = new Date(Date.now() - days * 86_400_000);

    const [ai, events, sessions, waitlist, users] = await Promise.all([
      db.usageEvent.groupBy({
        by: ["kind", "actorType", "ok"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, estCostUsd: true },
        _avg: { latencyMs: true },
      }),
      db.analyticsEvent.groupBy({ by: ["name"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      db.practiceSession.groupBy({ by: ["scenarioId", "status"], where: { startedAt: { gte: since } }, _count: { _all: true } }),
      db.waitlistEntry.groupBy({ by: ["trackId"], _count: { _all: true } }),
      db.user.count(),
    ]);

    return NextResponse.json({ days, ai, events, sessions, waitlist, users });
  } catch (err) {
    return errorResponse(err);
  }
}

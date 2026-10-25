import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { allow } from "@/lib/auth/rate-limit";
import { track } from "@/lib/analytics";
import { assertSameOrigin, clientIp, errorResponse, readJson } from "@/lib/http";
import { joinWaitlist } from "@/lib/waitlist/service";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (!allow(`waitlist:${clientIp(req)}`, 10, 3600_000)) {
      throw new AppError("limit_reached", "Too many attempts. Please try again later.");
    }
    const result = await joinWaitlist(await readJson(req));
    if (!result.alreadyJoined) await track("waitlist_join", "unknown");
    return NextResponse.json(result, { status: result.alreadyJoined ? 200 : 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

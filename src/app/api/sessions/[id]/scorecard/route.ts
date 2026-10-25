import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/identity";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { requestScorecard } from "@/lib/sessions/service";

export const maxDuration = 90;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const { id } = await params;
    const actor = await getActor();
    if (!actor) throw new AppError("not_found", "Practice session not found.");
    const session = await requestScorecard(actor, id);
    return NextResponse.json({ session }, { status: session.status === "scoring" ? 202 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}

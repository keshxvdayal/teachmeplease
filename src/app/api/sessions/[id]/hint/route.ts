import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/identity";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { requestHint } from "@/lib/sessions/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const { id } = await params;
    const actor = await getActor();
    if (!actor) throw new AppError("not_found", "Practice session not found.");
    return NextResponse.json(await requestHint(actor, id));
  } catch (err) {
    return errorResponse(err);
  }
}

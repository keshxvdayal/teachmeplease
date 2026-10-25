import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/identity";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { abandonSession } from "@/lib/sessions/service";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const { id } = await params;
    const actor = await getActor();
    if (!actor) throw new AppError("not_found", "Practice session not found.");
    await abandonSession(actor, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

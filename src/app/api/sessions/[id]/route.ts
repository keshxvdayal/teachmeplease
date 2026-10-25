import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/identity";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { deleteSession, getSessionView } from "@/lib/sessions/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    return NextResponse.json({ session: await getSessionView(await getActor(), id) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    assertSameOrigin(req);
    const { id } = await params;
    const actor = await getActor();
    if (!actor) throw new AppError("not_found", "Practice session not found.");
    await deleteSession(actor, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

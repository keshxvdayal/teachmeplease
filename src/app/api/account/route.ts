import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { endAuthSession, getActor } from "@/lib/auth/identity";
import { assertSameOrigin, errorResponse } from "@/lib/http";

/** Deletes the account and, via cascade, all practice sessions, messages and scorecards. */
export async function DELETE(req: Request) {
  try {
    assertSameOrigin(req);
    const actor = await getActor();
    if (!actor || actor.type !== "user") throw new AppError("unauthorized", "Please sign in.");
    await endAuthSession();
    await db.user.delete({ where: { id: actor.userId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

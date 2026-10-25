import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureActor, getActor } from "@/lib/auth/identity";
import { hashIp } from "@/lib/auth/crypto";
import { assertSameOrigin, clientIp, errorResponse, readJson } from "@/lib/http";
import { createSession, deleteAllHistory, listHistory } from "@/lib/sessions/service";

const createInput = z.object({
  scenarioId: z.string().min(1).max(100),
  language: z.string().min(1).max(20),
  speechLocale: z.string().max(20).optional(),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const input = createInput.parse(await readJson(req));
    const ip = clientIp(req);
    const actor = await ensureActor(ip);
    const session = await createSession(actor, hashIp(ip), input);
    return NextResponse.json({ session }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET() {
  try {
    const actor = await getActor();
    return NextResponse.json({ sessions: actor ? await listHistory(actor) : [] });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    assertSameOrigin(req);
    const actor = await getActor();
    return NextResponse.json({ deleted: actor ? await deleteAllHistory(actor) : 0 });
  } catch (err) {
    return errorResponse(err);
  }
}

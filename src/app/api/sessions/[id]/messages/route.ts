import { NextResponse } from "next/server";
import { z } from "zod";
import { getActor } from "@/lib/auth/identity";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { sendMessage } from "@/lib/sessions/service";

const input = z.object({
  // Length is enforced in the service so the user gets a friendly message.
  text: z.string().max(5000),
  clientMessageId: z.string().uuid(),
  inputMode: z.enum(["voice", "text"]).optional(),
  speechMs: z.number().int().min(0).max(600_000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const { id } = await params;
    const actor = await getActor();
    if (!actor) throw new AppError("not_found", "Practice session not found.");
    const result = await sendMessage(actor, id, input.parse(await readJson(req)));
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

import { NextResponse } from "next/server";
import { endAuthSession } from "@/lib/auth/identity";
import { assertSameOrigin, errorResponse } from "@/lib/http";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    await endAuthSession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

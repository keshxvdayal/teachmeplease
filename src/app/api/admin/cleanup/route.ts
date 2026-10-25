import { NextResponse } from "next/server";
import { assertAdmin, errorResponse } from "@/lib/http";
import { runCleanup } from "@/lib/retention";

export async function POST(req: Request) {
  try {
    assertAdmin(req);
    return NextResponse.json(await runCleanup());
  } catch (err) {
    return errorResponse(err);
  }
}

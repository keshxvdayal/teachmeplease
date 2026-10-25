import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, ai: Boolean(process.env.GEMINI_API_KEY) });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    const headers: Record<string, string> = {};
    if (err.retryAfterSeconds) headers["Retry-After"] = String(err.retryAfterSeconds);
    return NextResponse.json(
      { error: { code: err.code, message: err.message, retryAfterSeconds: err.retryAfterSeconds } },
      { status: err.status, headers },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "bad_request", message: err.issues[0]?.message ?? "Invalid request." } },
      { status: 400 },
    );
  }
  // Log the error type only; never log request bodies (they contain user transcripts).
  console.error("[api] unexpected error:", err instanceof Error ? err.name + ": " + err.message : err);
  return NextResponse.json(
    { error: { code: "server_error", message: "Something went wrong on our side. Please try again." } },
    { status: 500 },
  );
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("bad_request", "Request body must be valid JSON.");
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** CSRF defence in depth (cookies are also SameSite=Lax): reject cross-origin mutations. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // same-origin fetches from older browsers / server-to-server
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host === host) return;
  } catch {
    /* fall through */
  }
  throw new AppError("forbidden", "Cross-origin request blocked.");
}

export function assertAdmin(req: Request): void {
  const expected = process.env.ADMIN_TOKEN;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || expected.length < 16 || given !== expected) throw new AppError("unauthorized", "Admin token required.");
}

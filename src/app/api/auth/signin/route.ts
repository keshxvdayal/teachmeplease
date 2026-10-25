import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { credentialsInput } from "@/lib/auth/credentials";
import { verifyPassword } from "@/lib/auth/crypto";
import { claimAnonymousSessions, startAuthSession } from "@/lib/auth/identity";
import { allow } from "@/lib/auth/rate-limit";
import { assertSameOrigin, clientIp, errorResponse, readJson } from "@/lib/http";

// Used to keep timing similar when the email doesn't exist.
const DUMMY_HASH = "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (!allow(`signin:${clientIp(req)}`, 20, 900_000)) {
      throw new AppError("limit_reached", "Too many sign-in attempts. Please wait a few minutes.");
    }
    const { email, password } = credentialsInput.parse(await readJson(req));
    const user = await db.user.findUnique({ where: { email } });
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new AppError("unauthorized", "Incorrect email or password.");
    await startAuthSession(user.id);
    const claimed = await claimAnonymousSessions(user.id);
    return NextResponse.json({ ok: true, claimedSessions: claimed });
  } catch (err) {
    return errorResponse(err);
  }
}

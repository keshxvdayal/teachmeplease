import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { credentialsInput } from "@/lib/auth/credentials";
import { hashPassword } from "@/lib/auth/crypto";
import { claimAnonymousSessions, startAuthSession } from "@/lib/auth/identity";
import { allow } from "@/lib/auth/rate-limit";
import { assertSameOrigin, clientIp, errorResponse, readJson } from "@/lib/http";
import { track } from "@/lib/analytics";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (!allow(`signup:${clientIp(req)}`, 10, 3600_000)) {
      throw new AppError("limit_reached", "Too many sign-up attempts. Please try again later.");
    }
    const { email, password } = credentialsInput.parse(await readJson(req));
    let user;
    try {
      user = await db.user.create({ data: { email, passwordHash: await hashPassword(password) } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new AppError("conflict", "An account with this email already exists. Try signing in.");
      }
      throw err;
    }
    await startAuthSession(user.id);
    const claimed = await claimAnonymousSessions(user.id);
    await track("signup", "user");
    return NextResponse.json({ ok: true, claimedSessions: claimed }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

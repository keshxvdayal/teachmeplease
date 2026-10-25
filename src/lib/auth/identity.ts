import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hashIp, newToken, sha256, sign, unsign } from "./crypto";

export const AUTH_COOKIE = "tmp_auth";
export const ANON_COOKIE = "tmp_anon";
const AUTH_TTL_DAYS = 30;
const ANON_TTL_DAYS = 180;

export type Actor =
  | { type: "user"; userId: string; email: string; planId: string; anonId: string | null }
  | { type: "anonymous"; anonId: string };

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** Resolves the current visitor from cookies. Read-only, safe in server components. */
export async function getActor(): Promise<Actor | null> {
  const jar = await cookies();
  const anonId = unsign(jar.get(ANON_COOKIE)?.value);

  const token = jar.get(AUTH_COOKIE)?.value;
  if (token) {
    const session = await db.authSession.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (session && session.expiresAt > new Date()) {
      return { type: "user", userId: session.userId, email: session.user.email, planId: session.user.planId, anonId };
    }
  }

  if (anonId) {
    const visitor = await db.anonymousVisitor.findUnique({ where: { id: anonId } });
    if (visitor) return { type: "anonymous", anonId };
  }
  return null;
}

/** Like getActor, but creates an anonymous visitor if needed. Route handlers only (sets a cookie). */
export async function ensureActor(ip: string): Promise<Actor> {
  const existing = await getActor();
  if (existing) return existing;
  const visitor = await db.anonymousVisitor.create({ data: { ipHash: hashIp(ip) } });
  (await cookies()).set(ANON_COOKIE, sign(visitor.id), { ...cookieBase, maxAge: ANON_TTL_DAYS * 86400 });
  return { type: "anonymous", anonId: visitor.id };
}

export async function startAuthSession(userId: string): Promise<void> {
  const token = newToken();
  await db.authSession.create({
    data: { tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + AUTH_TTL_DAYS * 86400_000) },
  });
  (await cookies()).set(AUTH_COOKIE, token, { ...cookieBase, maxAge: AUTH_TTL_DAYS * 86400 });
}

export async function endAuthSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  if (token) await db.authSession.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(AUTH_COOKIE);
}

/** Moves the visitor's anonymous practice sessions into their account after sign-in. */
export async function claimAnonymousSessions(userId: string): Promise<number> {
  const anonId = unsign((await cookies()).get(ANON_COOKIE)?.value);
  if (!anonId) return 0;
  const res = await db.practiceSession.updateMany({ where: { anonId, userId: null }, data: { userId } });
  return res.count;
}

/** Prisma filter selecting sessions owned by this actor. */
export function ownedBy(actor: Actor) {
  return actor.type === "user" ? { userId: actor.userId } : { anonId: actor.anonId, userId: null };
}

export function canAccess(actor: Actor | null, session: { userId: string | null; anonId: string | null }): boolean {
  if (!actor) return false;
  if (session.userId) return actor.type === "user" && actor.userId === session.userId;
  return actor.type === "anonymous" && session.anonId !== null && session.anonId === actor.anonId;
}

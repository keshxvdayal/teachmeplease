import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getTrack } from "@/lib/scenarios";

export const waitlistInput = z.object({
  email: z.string().trim().toLowerCase().max(254).email("Please enter a valid email address."),
  trackId: z.string().min(1, "Please choose a track."),
  consent: z.boolean().default(false),
});

export async function joinWaitlist(raw: unknown): Promise<{ alreadyJoined: boolean }> {
  const input = waitlistInput.parse(raw);
  const track = getTrack(input.trackId);
  if (!track || track.status !== "coming_soon") throw new AppError("bad_request", "Please choose an upcoming track.");

  try {
    await db.waitlistEntry.create({ data: input });
    return { alreadyJoined: false };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Keep the most recent consent choice.
      await db.waitlistEntry.update({
        where: { email_trackId: { email: input.email, trackId: input.trackId } },
        data: { consent: input.consent },
      });
      return { alreadyJoined: true };
    }
    throw err;
  }
}

export function toCsv(rows: { email: string; trackId: string; consent: boolean; createdAt: Date }[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) || /^[=+\-@]/.test(v) ? `"${v.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : v);
  const lines = rows.map((r) => [esc(r.email), r.trackId, r.consent ? "yes" : "no", r.createdAt.toISOString()].join(","));
  return ["email,track,consent_to_updates,created_at_utc", ...lines].join("\n") + "\n";
}

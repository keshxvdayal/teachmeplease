import { NextResponse } from "next/server";
import { z } from "zod";
import { getActor } from "@/lib/auth/identity";
import { allow } from "@/lib/auth/rate-limit";
import { track } from "@/lib/analytics";
import { assertSameOrigin, clientIp, errorResponse, readJson } from "@/lib/http";

// Only client-observable events; server-side events are recorded where they happen.
const input = z.object({
  name: z.enum(["landing_view", "scorecard_view", "voice_failure"]),
  props: z.record(z.string().max(40), z.union([z.string().max(80), z.number(), z.boolean()])).optional(),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (!allow(`events:${clientIp(req)}`, 120, 3600_000)) return new NextResponse(null, { status: 204 });
    const { name, props } = input.parse(await readJson(req));
    const actor = await getActor();
    await track(name, actor?.type ?? "unknown", props);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}

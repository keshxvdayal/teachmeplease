import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/identity";
import { allow } from "@/lib/auth/rate-limit";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, clientIp, errorResponse } from "@/lib/http";
import { SttError, transcribe } from "@/lib/ai/stt";
import { isConversationLanguage } from "@/lib/config/languages";

// Below Vercel's 4.5 MB request limit; a minute of 16 kHz WAV is about 2 MB.
const MAX_BYTES = 4_000_000;
const PER_MINUTE = 30;
const AUDIO_TYPES = /^audio\/(wav|x-wav|webm|ogg|mp4|mpeg|aac|flac)$/;

/**
 * Transcribes one push-to-talk turn. Multipart form: `audio` (the clip), `lang` (BCP-47 locale),
 * `language` (conversation language id) and optional `context` (the client's last line).
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const actor = await getActor();
    if (!actor) throw new AppError("unauthorized", "Start a practice session first.");
    const who = actor.type === "user" ? actor.userId : actor.anonId;
    if (!allow(`stt:${who}`, PER_MINUTE, 60_000) || !allow(`stt-ip:${clientIp(req)}`, PER_MINUTE * 2, 60_000)) {
      throw new AppError("limit_reached", "Too many voice requests. Slow down a little.", { retryAfterSeconds: 20 });
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new AppError("bad_request", "Expected a multipart form.");
    }
    const file = form.get("audio");
    if (!(file instanceof Blob)) throw new AppError("bad_request", "Missing audio.");
    const mimeType = file.type.split(";")[0].trim().toLowerCase();
    if (!AUDIO_TYPES.test(mimeType)) throw new AppError("bad_request", "Unsupported audio format.");
    if (file.size === 0) return NextResponse.json({ text: "" });
    if (file.size > MAX_BYTES) throw new AppError("message_too_long", "That recording is too long. Keep each turn under a minute.");

    const locale = String(form.get("lang") ?? "en-US").slice(0, 20).replace(/[^A-Za-z0-9-]/g, "") || "en-US";
    const langField = String(form.get("language") ?? "en");
    const language = isConversationLanguage(langField) ? langField : "en";
    const context = String(form.get("context") ?? "").replace(/\s+/g, " ").trim().slice(0, 400) || undefined;

    const audio = Buffer.from(await file.arrayBuffer());
    const text = await transcribe(audio, mimeType === "audio/x-wav" ? "audio/wav" : mimeType, { language, locale, context });
    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof SttError) {
      if (err.code === "config") console.error("[stt]", err.message);
      return errorResponse(
        new AppError(err.code === "rate_limited" ? "ai_rate_limited" : "ai_unavailable", "Couldn't transcribe that. Try again."),
      );
    }
    return errorResponse(err);
  }
}

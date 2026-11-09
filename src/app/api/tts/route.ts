import { z } from "zod";
import { getActor } from "@/lib/auth/identity";
import { allow } from "@/lib/auth/rate-limit";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, clientIp, errorResponse, readJson } from "@/lib/http";
import { GEMINI_VOICES } from "@/lib/config/voices";
import { streamSpeech, streamsAudio, TTS_SAMPLE_RATE, TtsError } from "@/lib/ai/tts";

// One request speaks one whole reply of the client, streamed as it is generated.
const input = z.object({
  text: z.string().trim().min(1).max(800),
  voice: z.enum(GEMINI_VOICES),
  tone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[\p{L} ,'-]*$/u)
    .optional()
    .nullable(),
});

// One request per reply, so this allows a brisk conversation but not bulk use.
const PER_MINUTE = 20;

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    // Only visitors of the app (they get a cookie when they start a session) may use the voice.
    const actor = await getActor();
    if (!actor) throw new AppError("unauthorized", "Start a practice session first.");
    const who = actor.type === "user" ? actor.userId : actor.anonId;
    if (!allow(`tts:${who}`, PER_MINUTE, 60_000) || !allow(`tts-ip:${clientIp(req)}`, PER_MINUTE * 2, 60_000)) {
      throw new AppError("limit_reached", "Too many voice requests. Slow down a little.", { retryAfterSeconds: 20 });
    }

    const { text, voice, tone } = input.parse(await readJson(req));
    const { stream, model } = await streamSpeech({ text, voice, tone, signal: req.signal });
    // Raw 16-bit mono PCM, sent chunk by chunk so the browser can start playing straight away.
    return new Response(stream, {
      headers: {
        "Content-Type": `audio/L16;rate=${TTS_SAMPLE_RATE};channels=1`,
        "X-Sample-Rate": String(TTS_SAMPLE_RATE),
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
        "X-TTS-Model": model,
        // "0" when only a model that answers with a finished clip was available: too slow for a
        // live call, so the browser switches to its own voice for a while.
        "X-TTS-Streaming": streamsAudio(model) ? "1" : "0",
      },
    });
  } catch (err) {
    // The browser falls back to its own voice on any failure.
    if (err instanceof TtsError) {
      if (err.code === "config") console.error("[tts]", err.message);
      return errorResponse(
        new AppError(err.code === "rate_limited" ? "ai_rate_limited" : "ai_unavailable", "The voice is unavailable right now.", {
          retryAfterSeconds: err.code === "rate_limited" ? Math.ceil((err.retryAfterMs ?? 60_000) / 1000) : undefined,
        }),
      );
    }
    return errorResponse(err);
  }
}

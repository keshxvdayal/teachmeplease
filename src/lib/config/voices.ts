// Gemini text-to-speech prebuilt voices. Each scenario picks one in `voice.gemini_voice`.
// Gemini speaks every supported language with any of these voices.

export const GEMINI_VOICES = [
  // Female-sounding
  "Leda",
  "Kore",
  "Aoede",
  "Zephyr",
  "Callirrhoe",
  "Autonoe",
  "Despina",
  "Erinome",
  "Laomedeia",
  "Achernar",
  "Gacrux",
  "Pulcherrima",
  "Vindemiatrix",
  "Sulafat",
  // Male-sounding
  "Puck",
  "Charon",
  "Fenrir",
  "Orus",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Algenib",
  "Rasalgethi",
  "Alnilam",
  "Schedar",
  "Achird",
  "Zubenelgenubi",
  "Sadachbia",
  "Sadaltager",
] as const;

export type GeminiVoice = (typeof GEMINI_VOICES)[number];

export const DEFAULT_GEMINI_VOICE: Record<"female" | "male", GeminiVoice> = { female: "Leda", male: "Puck" };

export function isGeminiVoice(v: unknown): v is GeminiVoice {
  return typeof v === "string" && (GEMINI_VOICES as readonly string[]).includes(v);
}

/** The voice to use for a persona: its own, or a default for its gender. */
export function voiceFor(voice: { gender: "female" | "male"; gemini_voice?: string }): GeminiVoice {
  return isGeminiVoice(voice.gemini_voice) ? voice.gemini_voice : DEFAULT_GEMINI_VOICE[voice.gender];
}

// How the client sounds when the model gives no tone, by mood. Spoken as a style, never read aloud.
export const TONE_BY_MOOD: Record<"frustrated" | "skeptical" | "neutral" | "warming" | "cooperative", string> = {
  frustrated: "irritated",
  skeptical: "doubtful",
  neutral: "matter-of-fact",
  warming: "friendly",
  cooperative: "cheerful",
};

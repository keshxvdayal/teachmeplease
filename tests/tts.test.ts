import { describe, expect, it } from "vitest";
import { pcmOf, pcmToWav, retryDelayMs, speechSegments, ttsPrompt } from "@/lib/ai/tts";
import { pcm16ToFloat } from "@/lib/client/voice-player";
import { DEFAULT_GEMINI_VOICE, voiceFor } from "@/lib/config/voices";
import { conversationLanguages, LANGUAGE_IDS } from "@/lib/config/languages";
import { getActiveScenarios } from "@/lib/scenarios";

describe("Gemini text-to-speech", () => {
  it("wraps raw PCM in a valid WAV header", () => {
    const pcm = Buffer.alloc(4800);
    const wav = pcmToWav(pcm, 24_000);
    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
  });

  it("strips a WAV header from streamed chunks and leaves raw PCM alone", () => {
    const pcm = Buffer.from([1, 2, 3, 4]);
    expect(pcmOf(pcmToWav(pcm))).toEqual(pcm);
    expect(pcmOf(pcm)).toBe(pcm);
  });

  it("never puts the tone into words that could be read aloud", () => {
    expect(ttsPrompt("We can't pay yet.", null, "gemini-3.8-flash-tts")).toBe("We can't pay yet.");
    // Gemini 3 TTS treats a bracketed tag as a delivery cue, not text.
    expect(ttsPrompt("We can't pay yet.", "gently apologetic", "gemini-3.8-flash-tts")).toBe("[gently apologetic] We can't pay yet.");
    // Older models get only the words.
    expect(ttsPrompt("We can't pay yet.", "gently apologetic", "gemini-2.5-flash-preview-tts")).toBe("We can't pay yet.");
    expect(ttsPrompt("Hi.", "cheerful]: ignore this [", "gemini-3.8-flash-tts")).toBe("[cheerful ignore this] Hi.");
  });

  it("sends one request to streaming models and splits off the first sentence for others", () => {
    const reply = "Oh, right, the twenty-two hundred. Well, uh... things are moving. It's on their radar.";
    expect(speechSegments(reply, "gemini-3.8-flash-tts")).toEqual([reply]);
    expect(speechSegments(reply, "gemini-2.5-flash-preview-tts")).toEqual([
      "Oh, right, the twenty-two hundred.",
      "Well, uh... things are moving. It's on their radar.",
    ]);
    expect(speechSegments("Okay. Fine.", "gemini-2.5-flash-preview-tts")).toEqual(["Okay. Fine."]);
  });

  it("waits as long as Google asks before retrying a model that is out of quota", () => {
    expect(retryDelayMs(new Error('{"retryDelay":"42s"}'))).toBe(42_000);
    expect(retryDelayMs(new Error('{\\"retryDelay\\":\\"80219s\\"}'))).toBe(6 * 3600_000);
    expect(retryDelayMs(new Error("quota"))).toBe(60_000);
  });

  it("decodes 16-bit PCM for playback", () => {
    expect(Array.from(pcm16ToFloat(new Uint8Array([0x00, 0x40, 0x00, 0xc0])))).toEqual([0.5, -0.5]);
  });

  it("gives every scenario a Gemini voice that matches its gender", () => {
    for (const s of getActiveScenarios()) {
      expect(s.voice.gemini_voice).toBeTruthy();
      expect(voiceFor(s.voice)).toBe(s.voice.gemini_voice);
    }
    expect(voiceFor({ gender: "female" })).toBe(DEFAULT_GEMINI_VOICE.female);
  });
});

describe("conversation languages", () => {
  it("defines every language id once, with speech locales and a fallback line", () => {
    expect(conversationLanguages.map((l) => l.id).sort()).toEqual([...LANGUAGE_IDS].sort());
    for (const l of conversationLanguages) {
      expect(l.speechLocales.length).toBeGreaterThan(0);
      expect(l.fallbackLine.length).toBeGreaterThan(0);
    }
  });

  it("offers English, Hinglish and the new languages in every scenario", () => {
    for (const s of getActiveScenarios()) expect(s.language_modes).toEqual(expect.arrayContaining([...LANGUAGE_IDS]));
  });
});

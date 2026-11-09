import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanTranscript, sttInstruction, transcribe } from "@/lib/ai/stt";

describe("cleanTranscript", () => {
  it("keeps spoken words", () => expect(cleanTranscript("  Hi, about the invoice. \n")).toBe("Hi, about the invoice."));
  it("strips labels and quotes", () => expect(cleanTranscript('Transcript: "Hello there"')).toBe("Hello there"));
  it("treats silence markers as empty", () => {
    for (const s of ["[silence]", "silence", "[no speech]", "[inaudible]."]) expect(cleanTranscript(s)).toBe("");
  });
});

describe("transcribe", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends the audio inline and falls back to the next model on 429", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "model-a");
    vi.stubEnv("GEMINI_FALLBACK_MODEL", "model-b");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ text: "Hello there" }] } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(transcribe(Buffer.from("RIFFxxxx"), "audio/wav", { language: "en", locale: "en-US" })).resolves.toBe("Hello there");
    expect(fetchMock.mock.calls[1][0]).toContain("model-b");
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.contents[0].parts[0].inlineData.mimeType).toBe("audio/wav");
  });

  it("fails with config when the key is missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(transcribe(Buffer.from("x"), "audio/wav", { language: "en", locale: "en-US" })).rejects.toMatchObject({ code: "config" });
  });
});

describe("sttInstruction", () => {
  it("keeps Hinglish in Roman script without translating", () => {
    const p = sttInstruction({ language: "hinglish", locale: "en-IN" });
    expect(p).toMatch(/Roman/);
    expect(p).toMatch(/Never translate Hindi/);
    expect(p).toMatch(/Never use Devanagari/);
  });
  it("includes the client's last line as context", () => {
    expect(sttInstruction({ language: "en", locale: "en-US", context: "When can you send the invoice?" })).toContain("send the invoice");
  });
});

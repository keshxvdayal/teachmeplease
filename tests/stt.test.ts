import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanTranscript, transcribe } from "@/lib/ai/stt";

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

    await expect(transcribe(Buffer.from("RIFFxxxx"), "audio/wav", "en-US")).resolves.toBe("Hello there");
    expect(fetchMock.mock.calls[1][0]).toContain("model-b");
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.contents[0].parts[1].inlineData.mimeType).toBe("audio/wav");
  });

  it("fails with config when the key is missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(transcribe(Buffer.from("x"), "audio/wav", "en-US")).rejects.toMatchObject({ code: "config" });
  });
});

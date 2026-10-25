import { GeminiProvider } from "./gemini";
import type { LLMProvider } from "./types";

export * from "./types";

let provider: LLMProvider | null = null;

/** The single place that decides which LLM vendor the app uses. */
export function getProvider(): LLMProvider {
  if (!provider) {
    provider = new GeminiProvider(process.env.GEMINI_API_KEY ?? "", process.env.GEMINI_MODEL || "gemini-2.5-flash");
  }
  return provider;
}

/** Test hook. */
export function setProvider(p: LLMProvider | null) {
  provider = p;
}

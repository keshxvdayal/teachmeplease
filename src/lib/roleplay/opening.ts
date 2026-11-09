import { getLanguage, type ConversationLanguage } from "@/lib/config/languages";
import { localizedPersona } from "@/lib/scenarios";
import type { Scenario } from "@/lib/scenarios/schema";
import { callModel, type ActorType } from "@/lib/usage/tracking";
import { sanitizeReply } from "./engine";

// Translated opening lines, keyed by scenario version and language. They never change, so one
// translation per server instance is enough.
const cache = new Map<string, string>();

/**
 * The client's first line in the session's language. Hand-written localizations win; languages
 * marked `autoTranslate` are translated from English once, and fall back to English on failure.
 */
export async function openingLineFor(scenario: Scenario, language: ConversationLanguage, actorType: ActorType): Promise<string> {
  const persona = localizedPersona(scenario, language);
  const lang = getLanguage(language);
  if (language === "en" || scenario.localizations[language]?.opening_line || !lang?.autoTranslate) return persona.openingLine;

  const key = `${scenario.id}@${scenario.version}:${language}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const result = await callModel(
      { kind: "roleplay", actorType, sessionId: null },
      {
        system: `You translate one line of dialogue for a phone-call roleplay. The speaker is ${persona.name}, ${persona.role}. Translate it into ${lang.label} so it sounds like natural speech on a phone call. ${lang.promptInstruction} Keep names, numbers and amounts. Reply with the translated line only: no quotes, notes or labels.`,
        turns: [{ role: "user", text: scenario.opening_line }],
        temperature: 0.3,
        maxOutputTokens: 300,
        timeoutMs: 10_000,
        thinkingBudget: 0,
      },
    );
    const line = sanitizeReply(result.text, persona.name);
    if (!line) return persona.openingLine;
    cache.set(key, line);
    return line;
  } catch {
    // The client still answers in the chosen language from the next turn.
    return persona.openingLine;
  }
}

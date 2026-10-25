import { limits } from "@/lib/config/limits";
import type { ConversationLanguage } from "@/lib/config/languages";
import { localizedPersona } from "@/lib/scenarios";
import type { Scenario } from "@/lib/scenarios/schema";
import type { ChatTurn } from "@/lib/ai";
import { callModel, type ActorType } from "@/lib/usage/tracking";
import { buildRoleplaySystemPrompt, roleplayOutputSchema } from "./prompt";

export interface TranscriptEntry {
  speaker: "user" | "ai";
  text: string;
}

export interface ClientReply {
  reply: string;
  wantsToEnd: boolean;
  model: string;
}

const LEAK_PATTERNS = [
  /system prompt/i,
  /\bmy (private |hidden )?(instructions|goal|constraints)\b/i,
  /\b(ai_goal|behavior_rules|ai_constraints|scoring_criteria|success_conditions)\b/,
  /\bas an ai\b/i,
  /\blanguage model\b/i,
  /\bI(?:'m| am) (?:an? )?(?:AI|assistant|chatbot)\b/i,
];

const FALLBACK_LINES: Record<ConversationLanguage, string> = {
  en: "Sorry, I'm not sure what you mean. Can we get back to the point?",
  hi: "माफ़ कीजिए, मैं समझा नहीं। क्या हम मुद्दे पर वापस आ सकते हैं?",
  hinglish: "Sorry, main samjha nahi. Kya hum point pe wapas aa sakte hain?",
};

export function looksLikeLeak(text: string): boolean {
  return LEAK_PATTERNS.some((p) => p.test(text));
}

/** Cleans model output: unwraps quotes, strips name labels and markdown, enforces a length cap. */
export function sanitizeReply(raw: string, personaName: string, maxChars = limits.maxAiReplyChars): string {
  let text = raw.trim();
  const label = new RegExp(`^\\s*(\\*\\*)?(${escapeRegex(personaName)}|client)(\\*\\*)?\\s*:\\s*`, "i");
  text = text.replace(label, "");
  text = text.replace(/^["“]+|["”]+$/g, "");
  text = text.replace(/\*\*|__|`/g, "");
  text = text.replace(/\s*\n+\s*/g, " ").trim();
  if (text.length > maxChars) {
    const cut = text.slice(0, maxChars);
    const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "), cut.lastIndexOf("। "));
    text = lastStop > maxChars * 0.5 ? cut.slice(0, lastStop + 1) : cut.trimEnd() + "…";
  }
  return text;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseRoleplayOutput(text: string): { reply: string; end: boolean } | null {
  try {
    const obj = JSON.parse(text) as { reply?: unknown; end_conversation?: unknown };
    if (typeof obj.reply !== "string" || !obj.reply.trim()) return null;
    return { reply: obj.reply, end: obj.end_conversation === true };
  } catch {
    return null;
  }
}

export async function generateClientReply(args: {
  scenario: Scenario;
  language: ConversationLanguage;
  transcript: TranscriptEntry[];
  userTurn: number;
  maxTurns: number;
  sessionId: string;
  actorType: ActorType;
}): Promise<ClientReply> {
  const persona = localizedPersona(args.scenario, args.language);
  const system = buildRoleplaySystemPrompt(args.scenario, args.language, {
    userTurn: args.userTurn,
    maxTurns: args.maxTurns,
  });
  const turns: ChatTurn[] = args.transcript.map((m) => ({
    role: m.speaker === "ai" ? "assistant" : "user",
    text: m.text,
  }));

  const ctx = { kind: "roleplay" as const, actorType: args.actorType, sessionId: args.sessionId };
  const request = {
    system,
    turns,
    temperature: 0.8,
    maxOutputTokens: 400,
    timeoutMs: limits.roleplayTimeoutMs,
    jsonSchema: roleplayOutputSchema,
    thinkingBudget: 0,
  };

  // One corrective retry if the output is malformed or breaks character.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await callModel(ctx, request);
    const parsed = parseRoleplayOutput(result.text);
    if (parsed) {
      const reply = sanitizeReply(parsed.reply, persona.name);
      if (reply && !looksLikeLeak(reply)) {
        return { reply, wantsToEnd: parsed.end || args.userTurn >= args.maxTurns, model: result.model };
      }
    }
  }
  return { reply: FALLBACK_LINES[args.language], wantsToEnd: false, model: "fallback" };
}

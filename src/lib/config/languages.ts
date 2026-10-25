// Conversation languages (what the AI client speaks). Independent of interface language.

export type ConversationLanguage = "en" | "hi" | "hinglish";

export interface LanguageOption {
  id: ConversationLanguage;
  label: string;
  nativeLabel: string;
  // BCP-47 tags offered for speech recognition, first is the default.
  speechLocales: { tag: string; label: string }[];
  // Preferred voice tag for speech synthesis.
  ttsLocale: string;
  promptInstruction: string;
  // Shown to users so we don't overclaim quality.
  note?: string;
}

export const conversationLanguages: LanguageOption[] = [
  {
    id: "en",
    label: "English",
    nativeLabel: "English",
    speechLocales: [
      { tag: "en-US", label: "English (US)" },
      { tag: "en-GB", label: "English (UK)" },
      { tag: "en-CA", label: "English (Canada)" },
      { tag: "en-AU", label: "English (Australia)" },
      { tag: "en-IN", label: "English (India)" },
    ],
    ttsLocale: "en-US",
    promptInstruction:
      "Speak in clear, natural international business English. Avoid heavy regional slang.",
  },
  {
    id: "hi",
    label: "Hindi",
    nativeLabel: "हिन्दी",
    speechLocales: [{ tag: "hi-IN", label: "Hindi (India)" }],
    ttsLocale: "hi-IN",
    promptInstruction:
      "Speak in natural, conversational Hindi written in Devanagari script. Common business terms such as invoice, proposal, scope, deadline and revision may stay in English, as Indian professionals usually say them.",
    note: "Hindi voice quality depends on your device's installed voices.",
  },
  {
    id: "hinglish",
    label: "Hinglish",
    nativeLabel: "Hinglish",
    speechLocales: [
      { tag: "en-IN", label: "English (India)" },
      { tag: "hi-IN", label: "Hindi (India)" },
    ],
    ttsLocale: "en-IN",
    promptInstruction:
      "Speak in Hinglish: natural Hindi–English code-switching as used in Indian workplaces, written in Roman (Latin) script only, never Devanagari. Mix freely, e.g. 'Budget thoda tight hai, but let's see kya ho sakta hai.'",
    note: "Beta. Speech recognition may mis-hear mixed Hindi and English — edit before sending.",
  },
];

export function getLanguage(id: string): LanguageOption | undefined {
  return conversationLanguages.find((l) => l.id === id);
}

export function isConversationLanguage(id: string): id is ConversationLanguage {
  return conversationLanguages.some((l) => l.id === id);
}

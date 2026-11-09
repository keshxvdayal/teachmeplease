// Conversation languages (what the AI client speaks). Independent of interface language.
//
// Speech comes in through the browser's Web Speech API (`speechLocales`) and goes out through
// Gemini text-to-speech, which detects the language from the text itself. If Gemini's voice is
// unavailable, the browser's own voice for `ttsLocale` is used instead.

export const LANGUAGE_IDS = ["en", "hi", "hinglish", "es", "fr", "de", "pt", "ja", "mr", "bn", "ta", "te"] as const;

export type ConversationLanguage = (typeof LANGUAGE_IDS)[number];

export interface LanguageOption {
  id: ConversationLanguage;
  label: string;
  nativeLabel: string;
  // BCP-47 tags offered for speech recognition, first is the default.
  speechLocales: { tag: string; label: string }[];
  // Browser voice locale used when Gemini's voice is unavailable.
  ttsLocale: string;
  promptInstruction: string;
  // Said by the client when the model's reply can't be used.
  fallbackLine: string;
  // Scenarios don't need a hand-written opening line for this language: it is translated
  // from English when a session starts.
  autoTranslate?: boolean;
  // Shown to users so we don't overclaim quality.
  note?: string;
}

const NUMBERS_NOTE = "Common business terms may stay in English where professionals usually say them that way.";

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
    promptInstruction: "Speak in clear, natural international business English. Avoid heavy regional slang.",
    fallbackLine: "Sorry, I'm not sure what you mean. Can we get back to the point?",
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
    fallbackLine: "Sorry, main samjha nahi. Kya hum point pe wapas aa sakte hain?",
    note: "Speak naturally, mixing Hindi and English. Your words are written in Roman script.",
  },
  {
    id: "hi",
    label: "Hindi",
    nativeLabel: "हिन्दी",
    speechLocales: [{ tag: "hi-IN", label: "Hindi (India)" }],
    ttsLocale: "hi-IN",
    promptInstruction:
      "Speak in natural, conversational Hindi written in Devanagari script. Common business terms such as invoice, proposal, scope, deadline and revision may stay in English, as Indian professionals usually say them.",
    fallbackLine: "माफ़ कीजिए, मैं समझा नहीं। क्या हम मुद्दे पर वापस आ सकते हैं?",
  },
  {
    id: "mr",
    label: "Marathi",
    nativeLabel: "मराठी",
    speechLocales: [{ tag: "mr-IN", label: "Marathi (India)" }],
    ttsLocale: "mr-IN",
    promptInstruction: `Speak in natural, conversational Marathi written in Devanagari script. ${NUMBERS_NOTE}`,
    fallbackLine: "माफ करा, मला समजलं नाही. आपण मुद्द्यावर परत येऊया का?",
    autoTranslate: true,
  },
  {
    id: "bn",
    label: "Bengali",
    nativeLabel: "বাংলা",
    speechLocales: [
      { tag: "bn-IN", label: "Bengali (India)" },
      { tag: "bn-BD", label: "Bengali (Bangladesh)" },
    ],
    ttsLocale: "bn-IN",
    promptInstruction: `Speak in natural, conversational Bengali written in Bengali script. ${NUMBERS_NOTE}`,
    fallbackLine: "দুঃখিত, আমি ঠিক বুঝলাম না। আমরা কি মূল কথায় ফিরতে পারি?",
    autoTranslate: true,
  },
  {
    id: "ta",
    label: "Tamil",
    nativeLabel: "தமிழ்",
    speechLocales: [{ tag: "ta-IN", label: "Tamil (India)" }],
    ttsLocale: "ta-IN",
    promptInstruction: `Speak in natural, conversational Tamil written in Tamil script, the way people speak at work rather than formal written Tamil. ${NUMBERS_NOTE}`,
    fallbackLine: "மன்னிக்கவும், எனக்குப் புரியவில்லை. நாம் விஷயத்துக்கு வரலாமா?",
    autoTranslate: true,
  },
  {
    id: "te",
    label: "Telugu",
    nativeLabel: "తెలుగు",
    speechLocales: [{ tag: "te-IN", label: "Telugu (India)" }],
    ttsLocale: "te-IN",
    promptInstruction: `Speak in natural, conversational Telugu written in Telugu script. ${NUMBERS_NOTE}`,
    fallbackLine: "క్షమించండి, నాకు అర్థం కాలేదు. మనం విషయానికి వద్దామా?",
    autoTranslate: true,
  },
  {
    id: "es",
    label: "Spanish",
    nativeLabel: "Español",
    speechLocales: [
      { tag: "es-ES", label: "Spanish (Spain)" },
      { tag: "es-MX", label: "Spanish (Mexico)" },
      { tag: "es-US", label: "Spanish (US)" },
    ],
    ttsLocale: "es-ES",
    promptInstruction: "Speak in natural, conversational business Spanish, neutral enough to be understood across regions.",
    fallbackLine: "Perdona, no te entiendo bien. ¿Podemos volver al tema?",
    autoTranslate: true,
  },
  {
    id: "fr",
    label: "French",
    nativeLabel: "Français",
    speechLocales: [
      { tag: "fr-FR", label: "French (France)" },
      { tag: "fr-CA", label: "French (Canada)" },
    ],
    ttsLocale: "fr-FR",
    promptInstruction: "Speak in natural, conversational business French. Use 'vous' unless the other person clearly switches to 'tu'.",
    fallbackLine: "Pardon, je ne suis pas sûr de comprendre. On peut revenir au sujet ?",
    autoTranslate: true,
  },
  {
    id: "de",
    label: "German",
    nativeLabel: "Deutsch",
    speechLocales: [
      { tag: "de-DE", label: "German (Germany)" },
      { tag: "de-AT", label: "German (Austria)" },
      { tag: "de-CH", label: "German (Switzerland)" },
    ],
    ttsLocale: "de-DE",
    promptInstruction: "Speak in natural, conversational business German. Use 'Sie' unless the other person clearly switches to 'du'.",
    fallbackLine: "Entschuldigung, das habe ich nicht ganz verstanden. Können wir zum Thema zurückkommen?",
    autoTranslate: true,
  },
  {
    id: "pt",
    label: "Portuguese",
    nativeLabel: "Português",
    speechLocales: [
      { tag: "pt-BR", label: "Portuguese (Brazil)" },
      { tag: "pt-PT", label: "Portuguese (Portugal)" },
    ],
    ttsLocale: "pt-BR",
    promptInstruction: "Speak in natural, conversational Brazilian Portuguese as used at work.",
    fallbackLine: "Desculpa, não entendi direito. Podemos voltar ao assunto?",
    autoTranslate: true,
  },
  {
    id: "ja",
    label: "Japanese",
    nativeLabel: "日本語",
    speechLocales: [{ tag: "ja-JP", label: "Japanese (Japan)" }],
    ttsLocale: "ja-JP",
    promptInstruction: "Speak in natural, polite business Japanese (丁寧語), as said aloud on a phone call. Use Japanese script.",
    fallbackLine: "すみません、よく分かりませんでした。本題に戻ってもいいですか？",
    autoTranslate: true,
  },
];

export function getLanguage(id: string): LanguageOption | undefined {
  return conversationLanguages.find((l) => l.id === id);
}

export function isConversationLanguage(id: string): id is ConversationLanguage {
  return conversationLanguages.some((l) => l.id === id);
}

export function languageLabel(id: string): string {
  return getLanguage(id)?.label ?? id;
}

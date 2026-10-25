import { z } from "zod";
import { MOODS } from "@/lib/roleplay/moods";

const languageId = z.enum(["en", "hi", "hinglish"]);

const nonEmpty = z.string().trim().min(1);

export const trackSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: nonEmpty,
  description: nonEmpty,
  audience: nonEmpty,
  status: z.enum(["active", "coming_soon"]),
  order: z.number().int(),
});

const localizationSchema = z.object({
  persona_name: nonEmpty.optional(),
  persona_role: nonEmpty.optional(),
  opening_line: nonEmpty,
});

export const scenarioSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, "id must be kebab-case"),
    version: z.number().int().min(1),
    track_id: nonEmpty,
    is_active: z.boolean(),
    featured: z.boolean().default(false),
    order: z.number().int().default(100),
    title: nonEmpty,
    description: nonEmpty,
    difficulty: z.enum(["beginner", "intermediate", "advanced"]),
    estimated_duration: nonEmpty,
    skills: z.array(nonEmpty).min(1),
    user_role: nonEmpty,
    user_goal: nonEmpty,
    persona_name: nonEmpty,
    persona_role: nonEmpty,
    persona_description: nonEmpty,
    personality_traits: z.array(nonEmpty).min(1),
    scenario_context: nonEmpty,
    ai_goal: nonEmpty,
    ai_constraints: z.array(nonEmpty),
    opening_line: nonEmpty,
    opening_mood: z.enum(MOODS).default("neutral"),
    // Used to pick a matching browser voice; rate and pitch shape the character slightly.
    voice: z.object({
      gender: z.enum(["female", "male"]),
      rate: z.number().min(0.7).max(1.3).default(1),
      pitch: z.number().min(0.5).max(1.5).default(1),
    }),
    localizations: z.record(languageId, localizationSchema).default({}),
    behavior_rules: z.array(nonEmpty).min(1),
    success_conditions: z.array(nonEmpty).min(1),
    failure_conditions: z.array(nonEmpty),
    scoring_criteria: z.array(nonEmpty).min(1),
    dimension_guidance: z.object({
      clarity: nonEmpty,
      confidence: nonEmpty,
      professionalism: nonEmpty,
      objection_handling: nonEmpty,
      closing_outcome: nonEmpty,
    }),
    language_modes: z.array(languageId).min(1),
    default_language: languageId,
    max_turns: z.number().int().min(2).max(20),
    min_turns_for_scorecard: z.number().int().min(1),
  })
  .refine((s) => s.language_modes.includes(s.default_language), {
    message: "default_language must be one of language_modes",
  })
  .refine((s) => s.min_turns_for_scorecard <= s.max_turns, {
    message: "min_turns_for_scorecard must not exceed max_turns",
  })
  .refine(
    (s) => s.language_modes.every((l) => l === "en" || s.localizations[l]?.opening_line),
    { message: "every non-English language mode needs a localization with an opening_line" },
  );

export type Track = z.infer<typeof trackSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;

// The only scenario fields that may be sent to the browser.
export interface PublicScenario {
  id: string;
  trackId: string;
  title: string;
  description: string;
  difficulty: Scenario["difficulty"];
  estimatedDuration: string;
  skills: string[];
  userRole: string;
  userGoal: string;
  personaName: string;
  personaRole: string;
  personaDescription: string;
  personalityTraits: string[];
  voice: Scenario["voice"];
  openingMood: Scenario["opening_mood"];
  languageModes: Scenario["language_modes"];
  defaultLanguage: Scenario["default_language"];
  maxTurns: number;
  minTurnsForScorecard: number;
}

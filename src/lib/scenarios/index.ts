import fs from "node:fs";
import path from "node:path";
import { limits } from "@/lib/config/limits";
import type { ConversationLanguage } from "@/lib/config/languages";
import { scenarioSchema, trackSchema, type PublicScenario, type Scenario, type Track } from "./schema";

const CONTENT_DIR = path.join(process.cwd(), "content");

interface Catalog {
  tracks: Track[];
  scenarios: Scenario[];
}

let cache: Catalog | null = null;

/** Reads and validates every track and scenario file. Throws with the file name on bad data. */
export function loadCatalog(dir = CONTENT_DIR): Catalog {
  const tracks = trackSchema.array().parse(readJson(path.join(dir, "tracks.json")));
  const trackIds = new Set(tracks.map((t) => t.id));

  const scenarioDir = path.join(dir, "scenarios");
  const files = fs.readdirSync(scenarioDir).filter((f) => f.endsWith(".json")).sort();
  const scenarios: Scenario[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const result = scenarioSchema.safeParse(readJson(path.join(scenarioDir, file)));
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(`Invalid scenario file ${file}: ${issue.path.join(".")} ${issue.message}`);
    }
    const s = result.data;
    if (!trackIds.has(s.track_id)) throw new Error(`Scenario ${file} references unknown track "${s.track_id}"`);
    if (seen.has(s.id)) throw new Error(`Duplicate scenario id "${s.id}" in ${file}`);
    seen.add(s.id);
    scenarios.push({ ...s, max_turns: Math.min(s.max_turns, limits.maxTurnsCeiling) });
  }

  scenarios.sort((a, b) => a.order - b.order);
  tracks.sort((a, b) => a.order - b.order);
  return { tracks, scenarios };
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function catalog(): Catalog {
  // Re-read in development so editing a JSON file shows up without a restart.
  if (!cache || process.env.NODE_ENV === "development") cache = loadCatalog();
  return cache;
}

export function getTracks(): Track[] {
  return catalog().tracks;
}

export function getTrack(id: string): Track | undefined {
  return catalog().tracks.find((t) => t.id === id);
}

export function getFeaturedScenarios(): Scenario[] {
  return catalog().scenarios.filter((s) => s.is_active && s.featured);
}

export function getActiveScenarios(trackId?: string): Scenario[] {
  return catalog().scenarios.filter((s) => s.is_active && (!trackId || s.track_id === trackId));
}

/** Includes inactive scenarios so historic sessions still render. */
export function getScenario(id: string): Scenario | undefined {
  return catalog().scenarios.find((s) => s.id === id);
}

export function localizedPersona(s: Scenario, language: ConversationLanguage) {
  const loc = language === "en" ? undefined : s.localizations[language];
  return {
    name: loc?.persona_name ?? s.persona_name,
    role: loc?.persona_role ?? s.persona_role,
    openingLine: loc?.opening_line ?? s.opening_line,
  };
}

export function toPublicScenario(s: Scenario, language?: ConversationLanguage): PublicScenario {
  const persona = localizedPersona(s, language ?? "en");
  return {
    id: s.id,
    trackId: s.track_id,
    title: s.title,
    description: s.description,
    difficulty: s.difficulty,
    estimatedDuration: s.estimated_duration,
    skills: s.skills,
    userRole: s.user_role,
    userGoal: s.user_goal,
    personaName: persona.name,
    personaRole: persona.role,
    personaDescription: s.persona_description,
    personalityTraits: s.personality_traits,
    voice: s.voice,
    openingMood: s.opening_mood,
    languageModes: s.language_modes,
    defaultLanguage: s.default_language,
    maxTurns: s.max_turns,
    minTurnsForScorecard: s.min_turns_for_scorecard,
  };
}

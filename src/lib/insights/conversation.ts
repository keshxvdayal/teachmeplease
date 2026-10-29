// Conversation analytics computed from the transcript (and voice-turn durations).
// No runtime deps, so the results page can compute them in the browser.

export interface InsightMessage {
  speaker: "user" | "ai";
  text: string;
  turn: number;
  /** Voice turns: how long the learner spoke. */
  speechMs?: number | null;
}

/** "good" lands under "What went well"; "improve" under "What to work on". */
export type Verdict = "good" | "improve";

export interface Example {
  turn: number;
  text: string;
}

export interface CountMetric {
  count: number;
  /** Share of the learner's words, 0..100. */
  percent: number;
  verdict: Verdict;
  top: { phrase: string; count: number }[];
  examples: Example[];
}

export interface PaceTurn {
  turn: number;
  wpm: number;
  words: number;
  seconds: number;
}

export interface ConversationInsights {
  words: number;
  wordChoice: {
    fillers: CountMetric;
    hedges: CountMetric;
    repetition: CountMetric;
    conciseness: { avgWordsPerTurn: number; longestTurnWords: number; excessPercent: number; verdict: Verdict };
    starters: { word: string | null; percent: number; sentences: number; verdict: Verdict };
  };
  listening: {
    youSeconds: number;
    clientSeconds: number;
    /** The learner's share of talk time, 0..100. */
    youPercent: number;
    /** True when talk time is estimated from word counts (typed turns). */
    estimated: boolean;
    talkVerdict: Verdict;
    monologues: { count: number; verdict: Verdict; examples: Example[] };
    questions: { count: number; verdict: Verdict; examples: Example[] };
  };
  /** Null when there were no voice turns to time. */
  delivery: {
    wpm: number;
    band: "slow" | "conversational" | "fast";
    verdict: Verdict;
    turns: PaceTurn[];
    /** Spread between the slowest and fastest turn, in wpm. */
    spread: number;
  } | null;
}

export const PACE = { slow: 110, fast: 170 };
// Typical speaking rates, used to estimate talk time when a turn wasn't timed.
const LEARNER_WPM = 140;
const CLIENT_WPM = 160;
const MONOLOGUE_SECONDS = 60;
const MONOLOGUE_WORDS = 150;

const FILLERS = ["um", "uh", "uhm", "erm", "er", "ah", "hmm", "you know", "i mean", "basically", "actually", "literally", "like"];
const HEDGES = [
  "just",
  "maybe",
  "i think",
  "i guess",
  "kind of",
  "sort of",
  "hopefully",
  "probably",
  "possibly",
  "i feel like",
  "a little bit",
  "sorry",
  "i'll try",
  "try to",
];
const QUESTION_STARTS = /^(what|when|where|who|whom|which|why|how|could|would|can|do|does|did|is|are|will|should|have|has|shall)\b/i;

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
const sentences = (text: string) =>
  text
    .split(/(?<=[.!?…।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

/** Counts whole-word occurrences of each phrase in the learner's turns. */
function countPhrases(turns: InsightMessage[], phrases: string[], totalWords: number, isFiller: boolean): Omit<CountMetric, "verdict"> {
  const tally = new Map<string, number>();
  const examples: Example[] = [];
  for (const t of turns) {
    const lower = ` ${words(t.text).join(" ")} `;
    let hit = false;
    for (const p of phrases) {
      let n = lower.split(` ${p} `).length - 1;
      // "like" is only a filler when it's padding ("it's, like, done"), not a verb or comparison.
      if (isFiller && p === "like") n = (t.text.match(/(^|,\s*)like,|\blike,\s/gi) ?? []).length;
      if (n > 0) {
        tally.set(p, (tally.get(p) ?? 0) + n);
        hit = true;
      }
    }
    if (hit && examples.length < 3) examples.push({ turn: t.turn, text: t.text });
  }
  const count = [...tally.values()].reduce((a, b) => a + b, 0);
  const top = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([phrase, count]) => ({ phrase, count }));
  return { count, percent: totalWords ? round((count / totalWords) * 100, 1) : 0, top, examples };
}

/** Stutters ("the the") and the same 3-word phrase used in more than one turn. */
function countRepetition(turns: InsightMessage[], totalWords: number): Omit<CountMetric, "verdict"> {
  const tally = new Map<string, number>();
  const examples: Example[] = [];
  const seenIn = new Map<string, Set<number>>();
  for (const t of turns) {
    const w = words(t.text);
    let hit = false;
    for (let i = 1; i < w.length; i++) {
      if (w[i] === w[i - 1] && w[i].length > 1) {
        tally.set(`${w[i]} ${w[i]}`, (tally.get(`${w[i]} ${w[i]}`) ?? 0) + 1);
        hit = true;
      }
    }
    for (let i = 0; i + 2 < w.length; i++) {
      const tri = w.slice(i, i + 3).join(" ");
      if (!seenIn.has(tri)) seenIn.set(tri, new Set());
      seenIn.get(tri)!.add(t.turn);
    }
    if (hit && examples.length < 3) examples.push({ turn: t.turn, text: t.text });
  }
  for (const [tri, inTurns] of seenIn) if (inTurns.size > 1) tally.set(tri, inTurns.size - 1);
  const count = [...tally.values()].reduce((a, b) => a + b, 0);
  const top = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([phrase, count]) => ({ phrase, count }));
  return { count, percent: totalWords ? round((count / totalWords) * 100, 1) : 0, top, examples };
}

export function analyzeConversation(messages: InsightMessage[]): ConversationInsights {
  const userTurns = messages.filter((m) => m.speaker === "user");
  const clientTurns = messages.filter((m) => m.speaker === "ai");
  const turnWords = userTurns.map((t) => words(t.text).length);
  const totalWords = turnWords.reduce((a, b) => a + b, 0);

  const fillers = countPhrases(userTurns, FILLERS, totalWords, true);
  const hedges = countPhrases(userTurns, HEDGES, totalWords, false);
  const repetition = countRepetition(userTurns, totalWords);

  const avgWordsPerTurn = userTurns.length ? round(totalWords / userTurns.length) : 0;
  const longestTurnWords = Math.max(0, ...turnWords);
  const excessPercent = totalWords ? round(((fillers.count + hedges.count + repetition.count) / totalWords) * 100) : 0;

  // Sentence starters: one word opening a large share of sentences reads as repetitive.
  const userSentences = userTurns.flatMap((t) => sentences(t.text));
  const starterTally = new Map<string, number>();
  for (const s of userSentences) {
    // The first real word: "Um, so we can…" starts with "so", not "um".
    const first = words(s).find((w) => !FILLERS.includes(w));
    if (first) starterTally.set(first, (starterTally.get(first) ?? 0) + 1);
  }
  const [topStarter, topStarterCount] = [...starterTally.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const starterPercent = userSentences.length ? round((topStarterCount / userSentences.length) * 100) : 0;

  // Talk time: measured for voice turns, estimated from words otherwise.
  let youSeconds = 0;
  let estimated = false;
  for (const [i, t] of userTurns.entries()) {
    if (t.speechMs) youSeconds += t.speechMs / 1000;
    else {
      youSeconds += (turnWords[i] / LEARNER_WPM) * 60;
      estimated = true;
    }
  }
  const clientSeconds = clientTurns.reduce((a, t) => a + (words(t.text).length / CLIENT_WPM) * 60, 0);
  const youPercent = youSeconds + clientSeconds ? round((youSeconds / (youSeconds + clientSeconds)) * 100) : 0;

  const monologueTurns = userTurns.filter(
    (t, i) => (t.speechMs ? t.speechMs / 1000 > MONOLOGUE_SECONDS : false) || turnWords[i] > MONOLOGUE_WORDS,
  );
  const questionExamples: Example[] = [];
  for (const t of userTurns) {
    for (const s of sentences(t.text)) {
      if (s.endsWith("?") || QUESTION_STARTS.test(s)) questionExamples.push({ turn: t.turn, text: s });
    }
  }

  // Pace: only voice turns long enough to time meaningfully.
  const paceTurns: PaceTurn[] = userTurns
    .map((t, i) => ({ turn: t.turn, words: turnWords[i], seconds: (t.speechMs ?? 0) / 1000 }))
    .filter((t) => t.seconds >= 1.5 && t.words >= 3)
    .map((t) => ({ ...t, seconds: round(t.seconds, 1), wpm: round((t.words / t.seconds) * 60) }));
  let delivery: ConversationInsights["delivery"] = null;
  if (paceTurns.length) {
    const timedWords = paceTurns.reduce((a, t) => a + t.words, 0);
    const timedSeconds = paceTurns.reduce((a, t) => a + t.seconds, 0);
    const wpm = round((timedWords / timedSeconds) * 60);
    const band = wpm < PACE.slow ? "slow" : wpm > PACE.fast ? "fast" : "conversational";
    const rates = paceTurns.map((t) => t.wpm);
    delivery = { wpm, band, verdict: band === "conversational" ? "good" : "improve", turns: paceTurns, spread: Math.max(...rates) - Math.min(...rates) };
  }

  return {
    words: totalWords,
    wordChoice: {
      fillers: { ...fillers, verdict: fillers.percent <= 3 ? "good" : "improve" },
      hedges: { ...hedges, verdict: hedges.percent <= 3 ? "good" : "improve" },
      repetition: { ...repetition, verdict: repetition.percent <= 3 ? "good" : "improve" },
      conciseness: { avgWordsPerTurn, longestTurnWords, excessPercent, verdict: excessPercent <= 8 && avgWordsPerTurn <= 60 ? "good" : "improve" },
      starters: {
        word: topStarter,
        percent: starterPercent,
        sentences: userSentences.length,
        verdict: userSentences.length < 4 || starterPercent <= 30 ? "good" : "improve",
      },
    },
    listening: {
      youSeconds: round(youSeconds),
      clientSeconds: round(clientSeconds),
      youPercent,
      estimated,
      // On a client call the learner should listen at least as much as they talk.
      talkVerdict: youPercent <= 60 ? "good" : "improve",
      monologues: {
        count: monologueTurns.length,
        verdict: monologueTurns.length === 0 ? "good" : "improve",
        examples: monologueTurns.slice(0, 2).map((t) => ({ turn: t.turn, text: t.text })),
      },
      questions: {
        count: questionExamples.length,
        verdict: questionExamples.length >= Math.min(2, userTurns.length) ? "good" : "improve",
        examples: questionExamples.slice(0, 4),
      },
    },
    delivery,
  };
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

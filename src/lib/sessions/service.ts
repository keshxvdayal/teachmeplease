import type { Message, PracticeSession, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { limits } from "@/lib/config/limits";
import { getLanguage, isConversationLanguage, type ConversationLanguage } from "@/lib/config/languages";
import { AppError } from "@/lib/errors";
import { canAccess, ownedBy, type Actor } from "@/lib/auth/identity";
import { getScenario, localizedPersona, toPublicScenario } from "@/lib/scenarios";
import type { PublicScenario, Scenario } from "@/lib/scenarios/schema";
import { generateClientReply } from "@/lib/roleplay/engine";
import { generateScorecard } from "@/lib/scoring/engine";
import { scorecardSchema, type Scorecard } from "@/lib/scoring/schema";
import { assertCanSendMessage, assertCanStartSession } from "@/lib/usage/limits";
import { track } from "@/lib/analytics";

const SCORING_STALE_MS = 120_000;

export interface MessageView {
  id: string;
  speaker: "user" | "ai";
  text: string;
  turn: number;
  createdAt: string;
}

export interface SessionView {
  id: string;
  status: PracticeSession["status"];
  statusDetail: string | null;
  language: ConversationLanguage;
  speechLocale: string | null;
  userTurns: number;
  maxTurns: number;
  minTurnsForScorecard: number;
  scenario: PublicScenario;
  messages: MessageView[];
  /** clientMessageId of a user message still waiting for a reply (after an AI failure). */
  pendingRetry: { clientMessageId: string; text: string } | null;
  scorecard: Scorecard | null;
  scoringAttemptsLeft: number;
  startedAt: string;
  completedAt: string | null;
}

function toView(session: PracticeSession & { messages: Message[] }, scenario: Scenario): SessionView {
  const language = session.language as ConversationLanguage;
  const messages = [...session.messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const last = messages[messages.length - 1];
  const parsedScorecard = session.scorecard ? scorecardSchema.safeParse(session.scorecard) : null;
  return {
    id: session.id,
    status: session.status,
    statusDetail: session.statusDetail,
    language,
    speechLocale: session.speechLocale,
    userTurns: session.userTurns,
    maxTurns: session.maxTurns,
    minTurnsForScorecard: scenario.min_turns_for_scorecard,
    scenario: toPublicScenario(scenario, language),
    messages: messages.map((m) => ({
      id: m.id,
      speaker: m.speaker,
      text: m.text,
      turn: m.turn,
      createdAt: m.createdAt.toISOString(),
    })),
    pendingRetry:
      last?.speaker === "user" && last.clientMessageId ? { clientMessageId: last.clientMessageId, text: last.text } : null,
    scorecard: parsedScorecard?.success ? parsedScorecard.data : null,
    scoringAttemptsLeft: Math.max(0, limits.scoringAttemptsPerSession - session.scoringAttempts),
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
  };
}

function scenarioFor(session: PracticeSession): Scenario {
  const scenario = getScenario(session.scenarioId);
  if (!scenario) throw new AppError("not_found", "This scenario is no longer available.");
  return scenario;
}

/** Loads a session the actor owns. Missing and forbidden both look like 404 to avoid ID probing. */
async function loadOwned(actor: Actor | null, id: string) {
  const session = await db.practiceSession.findUnique({ where: { id }, include: { messages: true } });
  if (!session || !canAccess(actor, session)) throw new AppError("not_found", "Practice session not found.");
  return session;
}

export async function getSessionView(actor: Actor | null, id: string): Promise<SessionView> {
  const session = await loadOwned(actor, id);
  return toView(session, scenarioFor(session));
}

export async function createSession(
  actor: Actor,
  ipHash: string,
  input: { scenarioId: string; language: string; speechLocale?: string },
): Promise<SessionView> {
  const scenario = getScenario(input.scenarioId);
  if (!scenario || !scenario.is_active) throw new AppError("not_found", "That scenario isn't available.");
  if (!isConversationLanguage(input.language) || !scenario.language_modes.includes(input.language)) {
    throw new AppError("bad_request", "That language isn't available for this scenario.");
  }
  const lang = getLanguage(input.language)!;
  const speechLocale = lang.speechLocales.some((l) => l.tag === input.speechLocale)
    ? input.speechLocale!
    : lang.speechLocales[0].tag;

  await assertCanStartSession(actor, ipHash);

  const persona = localizedPersona(scenario, input.language);
  const session = await db.practiceSession.create({
    data: {
      userId: actor.type === "user" ? actor.userId : null,
      anonId: actor.type === "anonymous" ? actor.anonId : null,
      ipHash,
      trackId: scenario.track_id,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      language: input.language,
      speechLocale,
      maxTurns: scenario.max_turns,
      messages: { create: { speaker: "ai", text: persona.openingLine, turn: 0 } },
    },
    include: { messages: true },
  });

  await track("practice_start", actor.type, { scenario: scenario.id, language: input.language });
  return toView(session, scenario);
}

async function acquireLock(sessionId: string): Promise<boolean> {
  const now = new Date();
  const res = await db.practiceSession.updateMany({
    where: { id: sessionId, status: "active", OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockedUntil: new Date(now.getTime() + limits.sessionLockMs) },
  });
  return res.count === 1;
}

async function releaseLock(sessionId: string) {
  await db.practiceSession.update({ where: { id: sessionId }, data: { lockedUntil: null } }).catch(() => undefined);
}

export async function sendMessage(
  actor: Actor,
  id: string,
  input: { text: string; clientMessageId: string; inputMode?: "voice" | "text" },
): Promise<{ session: SessionView; wantsToEnd: boolean }> {
  const text = input.text.replace(/\s+/g, " ").trim();
  if (!text) throw new AppError("bad_request", "Please type or say something first.");
  if (text.length > limits.maxUserMessageChars) {
    throw new AppError("message_too_long", `Please keep each message under ${limits.maxUserMessageChars} characters.`);
  }

  const session = await loadOwned(actor, id);
  if (session.status !== "active") throw new AppError("conflict", "This practice session has already ended.");
  const scenario = scenarioFor(session);

  if (!(await acquireLock(session.id))) {
    throw new AppError("busy", "Still waiting for the client's previous reply.");
  }

  try {
    const messages = (await db.message.findMany({ where: { sessionId: session.id }, orderBy: { createdAt: "asc" } }));
    let userMessage = messages.find((m) => m.clientMessageId === input.clientMessageId);

    if (userMessage) {
      // Duplicate submit or retry after an AI failure.
      const answered = messages.some((m) => m.speaker === "ai" && m.turn === userMessage!.turn);
      if (answered) {
        const fresh = await loadOwned(actor, id);
        return { session: toView(fresh, scenario), wantsToEnd: fresh.userTurns >= fresh.maxTurns };
      }
    } else {
      const last = messages[messages.length - 1];
      if (last?.speaker === "user") {
        throw new AppError("conflict", "Your previous message hasn't had a reply yet. Retry it before sending another.");
      }
      if (session.userTurns >= session.maxTurns) {
        throw new AppError("turn_limit_reached", "You've reached the last turn. End the practice to see your feedback.");
      }
      await assertCanSendMessage(actor);

      const turn = session.userTurns + 1;
      [userMessage] = await db.$transaction([
        db.message.create({
          data: {
            sessionId: session.id,
            speaker: "user",
            text,
            turn,
            clientMessageId: input.clientMessageId,
            inputMode: input.inputMode ?? "text",
          },
        }),
        db.practiceSession.update({ where: { id: session.id }, data: { userTurns: turn } }),
      ]);
      messages.push(userMessage);
    }

    let reply;
    try {
      reply = await generateClientReply({
        scenario,
        language: session.language as ConversationLanguage,
        transcript: messages.map((m) => ({ speaker: m.speaker, text: m.text })),
        userTurn: userMessage.turn,
        maxTurns: session.maxTurns,
        sessionId: session.id,
        actorType: actor.type,
      });
    } catch (err) {
      await track("ai_failure", actor.type, { stage: "roleplay", code: (err as AppError).code ?? "unknown" });
      throw err;
    }

    await db.message.create({
      data: { sessionId: session.id, speaker: "ai", text: reply.reply, turn: userMessage.turn },
    });
    const fresh = await loadOwned(actor, id);
    return { session: toView(fresh, scenario), wantsToEnd: reply.wantsToEnd };
  } finally {
    await releaseLock(session.id);
  }
}

export async function requestScorecard(actor: Actor, id: string): Promise<SessionView> {
  const session = await loadOwned(actor, id);
  const scenario = scenarioFor(session);

  if (session.status === "scored" || session.status === "insufficient") return toView(session, scenario);
  if (session.status === "abandoned") throw new AppError("conflict", "This session was ended without feedback.");
  if (session.status === "scoring" && session.scoringStartedAt && Date.now() - session.scoringStartedAt.getTime() < SCORING_STALE_MS) {
    return toView(session, scenario);
  }
  if (session.userTurns < scenario.min_turns_for_scorecard) {
    throw new AppError(
      "too_short",
      `This session is too short for reliable feedback. Reply at least ${scenario.min_turns_for_scorecard} times to get a scorecard.`,
    );
  }
  if (session.scoringAttempts >= limits.scoringAttemptsPerSession) {
    throw new AppError("limit_reached", "We couldn't generate feedback for this session after several attempts. Please start a new practice.");
  }
  if (session.lockedUntil && session.lockedUntil > new Date()) {
    throw new AppError("busy", "Waiting for the client's last reply. Try again in a moment.");
  }

  // Atomic transition: only one request wins and calls the model.
  const now = new Date();
  const claimed = await db.practiceSession.updateMany({
    where: {
      id: session.id,
      OR: [
        { status: { in: ["active", "scoring_failed"] } },
        { status: "scoring", scoringStartedAt: { lt: new Date(now.getTime() - SCORING_STALE_MS) } },
      ],
    },
    data: {
      status: "scoring",
      scoringStartedAt: now,
      scoringAttempts: { increment: 1 },
      endedAt: session.endedAt ?? now,
      statusDetail: null,
    },
  });
  if (claimed.count === 0) return getSessionView(actor, id);

  const messages = [...session.messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  try {
    const outcome = await generateScorecard({
      scenario,
      language: session.language as ConversationLanguage,
      messages: messages.map((m) => ({ speaker: m.speaker, text: m.text, turn: m.turn })),
      sessionId: session.id,
      actorType: actor.type,
    });

    const data: Prisma.PracticeSessionUpdateInput =
      outcome.kind === "scored"
        ? {
            status: "scored",
            scorecard: outcome.scorecard as unknown as Prisma.InputJsonValue,
            overallScore: outcome.scorecard.overall_score,
            goalAchievement: outcome.scorecard.goal_achievement,
            scoringVersion: outcome.scorecard.scoring_version,
            model: outcome.scorecard.model,
            completedAt: new Date(),
          }
        : { status: "insufficient", statusDetail: outcome.reason, completedAt: new Date() };
    await db.practiceSession.update({ where: { id: session.id }, data });
    await track("session_completed", actor.type, { scenario: scenario.id, outcome: outcome.kind });
  } catch (err) {
    const code = err instanceof AppError ? err.code : "server_error";
    await db.practiceSession.update({ where: { id: session.id }, data: { status: "scoring_failed", statusDetail: code } });
    await track("ai_failure", actor.type, { stage: "scoring", code });
    throw err;
  }

  return getSessionView(actor, id);
}

export async function abandonSession(actor: Actor, id: string): Promise<void> {
  const session = await loadOwned(actor, id);
  if (session.status === "active" || session.status === "scoring_failed") {
    await db.practiceSession.update({ where: { id }, data: { status: "abandoned", endedAt: session.endedAt ?? new Date() } });
  }
}

export interface HistoryItem {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  language: string;
  status: PracticeSession["status"];
  overallScore: number | null;
  goalAchievement: string | null;
  userTurns: number;
  startedAt: string;
}

export async function listHistory(actor: Actor, take = 50): Promise<HistoryItem[]> {
  const rows = await db.practiceSession.findMany({
    where: { ...ownedBy(actor), userTurns: { gt: 0 } },
    orderBy: { startedAt: "desc" },
    take,
  });
  return rows.map((r) => ({
    id: r.id,
    scenarioId: r.scenarioId,
    scenarioTitle: getScenario(r.scenarioId)?.title ?? r.scenarioId,
    language: r.language,
    status: r.status,
    overallScore: r.overallScore,
    goalAchievement: r.goalAchievement,
    userTurns: r.userTurns,
    startedAt: r.startedAt.toISOString(),
  }));
}

export async function deleteSession(actor: Actor, id: string): Promise<void> {
  await loadOwned(actor, id);
  await db.practiceSession.delete({ where: { id } });
}

export async function deleteAllHistory(actor: Actor): Promise<number> {
  const res = await db.practiceSession.deleteMany({ where: ownedBy(actor) });
  return res.count;
}

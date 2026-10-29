import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { LLMError, setProvider } from "@/lib/ai";
import type { Actor } from "@/lib/auth/identity";
import { AppError } from "@/lib/errors";
import { limits } from "@/lib/config/limits";
import {
  abandonSession,
  createSession,
  deleteAllHistory,
  getSessionView,
  listHistory,
  requestHint,
  requestScorecard,
  sendMessage,
} from "@/lib/sessions/service";
import { FakeProvider, validScorecard } from "../helpers/fake-provider";

let fake: FakeProvider;
let anonA: Actor;
let anonB: Actor;
let userA: Actor;

const reply = (text: string, end = false, mood = "skeptical", notes = "", patience = "same") =>
  JSON.stringify({ reply: text, mood, patience, notes, end_conversation: end });
const id = () => crypto.randomUUID();

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

async function resetDb() {
  await db.$transaction([
    db.message.deleteMany(),
    db.practiceSession.deleteMany(),
    db.anonymousVisitor.deleteMany(),
    db.authSession.deleteMany(),
    db.user.deleteMany(),
    db.usageEvent.deleteMany(),
    db.analyticsEvent.deleteMany(),
    db.waitlistEntry.deleteMany(),
  ]);
}

beforeEach(async () => {
  await resetDb();
  fake = new FakeProvider();
  setProvider(fake);
  const [a, b] = await Promise.all([
    db.anonymousVisitor.create({ data: { ipHash: "ip-a" } }),
    db.anonymousVisitor.create({ data: { ipHash: "ip-b" } }),
  ]);
  const u = await db.user.create({ data: { email: "a@example.com", passwordHash: "x" } });
  anonA = { type: "anonymous", anonId: a.id };
  anonB = { type: "anonymous", anonId: b.id };
  userA = { type: "user", userId: u.id, email: u.email, planId: "free", anonId: null };
});

afterAll(async () => {
  await resetDb();
  await db.$disconnect();
});

describe("practice sessions", () => {
  it("starts with the scenario's localized opening line and no AI call", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "overdue-payment", language: "hinglish" });
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].speaker).toBe("ai");
    expect(s.messages[0].text).toMatch(/Arre hi/);
    expect(s.speechLocale).toBe("en-IN");
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects unknown scenarios and unsupported languages", async () => {
    await expectCode(createSession(anonA, "ip-a", { scenarioId: "nope", language: "en" }), "not_found");
    await expectCode(createSession(anonA, "ip-a", { scenarioId: "overdue-payment", language: "fr" }), "bad_request");
  });

  it("runs a conversation turn and returns the AI reply", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
    fake.push(reply("What would you cut?"));
    const r = await sendMessage(anonA, s.id, { text: "What part of the budget is the concern?", clientMessageId: id() });
    expect(r.session.userTurns).toBe(1);
    expect(r.session.messages.map((m) => m.speaker)).toEqual(["ai", "user", "ai"]);
    expect(r.session.messages[2].text).toBe("What would you cut?");
    // Transcript is passed to the model as alternating turns.
    expect(fake.calls[0].turns.map((t) => t.role)).toEqual(["assistant", "user"]);
    expect(await db.usageEvent.count({ where: { kind: "roleplay", ok: true } })).toBe(1);
  });

  it("does not let another visitor or user read or write the session", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
    await expectCode(getSessionView(anonB, s.id), "not_found");
    await expectCode(getSessionView(userA, s.id), "not_found");
    await expectCode(getSessionView(null, s.id), "not_found");
    await expectCode(sendMessage(anonB, s.id, { text: "hi", clientMessageId: id() }), "not_found");
    await expectCode(requestScorecard(anonB, s.id), "not_found");
    expect(await listHistory(anonB)).toHaveLength(0);
  });

  it("validates message length and emptiness on the server", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
    await expectCode(sendMessage(anonA, s.id, { text: "   ", clientMessageId: id() }), "bad_request");
    await expectCode(
      sendMessage(anonA, s.id, { text: "x".repeat(limits.maxUserMessageChars + 1), clientMessageId: id() }),
      "message_too_long",
    );
    expect(fake.calls).toHaveLength(0);
  });

  it("is idempotent for duplicate submits of the same message", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
    const cid = id();
    fake.push(reply("Hmm."));
    await sendMessage(anonA, s.id, { text: "Hello", clientMessageId: cid });
    const again = await sendMessage(anonA, s.id, { text: "Hello", clientMessageId: cid });
    expect(again.session.userTurns).toBe(1);
    expect(again.session.messages).toHaveLength(3);
    expect(fake.calls).toHaveLength(1);
  });

  it("keeps the user's message after an AI rate limit and lets them retry", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
    const cid = id();
    fake.push(new LLMError("rate_limited", "429", 10));
    await expectCode(sendMessage(anonA, s.id, { text: "Let's talk scope", clientMessageId: cid }), "ai_rate_limited");

    const view = await getSessionView(anonA, s.id);
    expect(view.pendingRetry).toEqual({ clientMessageId: cid, text: "Let's talk scope" });
    // A different message is refused until the pending one is retried.
    await expectCode(sendMessage(anonA, s.id, { text: "other", clientMessageId: id() }), "conflict");

    fake.push(reply("Go on."));
    const r = await sendMessage(anonA, s.id, { text: "Let's talk scope", clientMessageId: cid });
    expect(r.session.pendingRetry).toBeNull();
    expect(r.session.userTurns).toBe(1);
    expect(r.session.messages.at(-1)?.text).toBe("Go on.");
  });

  it("serialises concurrent sends with a per-session lock", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    fake.generate = (async (req) => {
      fake.calls.push(req);
      await gate;
      return { text: reply("ok"), model: "fake", inputTokens: 1, outputTokens: 1, latencyMs: 1 };
    }) as FakeProvider["generate"];

    const first = sendMessage(anonA, s.id, { text: "one", clientMessageId: id() });
    await new Promise((r) => setTimeout(r, 50));
    await expectCode(sendMessage(anonA, s.id, { text: "two", clientMessageId: id() }), "busy");
    release();
    await first;
    expect((await getSessionView(anonA, s.id)).userTurns).toBe(1);
  });

  it("enforces the scenario's turn limit", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "overdue-payment", language: "en" });
    for (let i = 0; i < s.maxTurns; i++) await sendMessage(anonA, s.id, { text: `turn ${i}`, clientMessageId: id() });
    expect(fake.calls.at(-1)?.system).toMatch(/FINAL exchange/);
    await expectCode(sendMessage(anonA, s.id, { text: "one more", clientMessageId: id() }), "turn_limit_reached");
  });

  it("on a voice call, a new turn replaces one the client never answered", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
    fake.push(new LLMError("timeout", "slow"));
    await expect(sendMessage(anonA, s.id, { text: "first try", clientMessageId: id(), inputMode: "voice" })).rejects.toBeTruthy();
    expect((await getSessionView(anonA, s.id)).pendingRetry?.text).toBe("first try");

    const r = await sendMessage(anonA, s.id, { text: "second try", clientMessageId: id(), inputMode: "voice", speechMs: 2000 });
    const userLines = r.session.messages.filter((m) => m.speaker === "user");
    expect(userLines.map((m) => m.text)).toEqual(["second try"]);
    expect(r.session.userTurns).toBe(1);
    expect(r.session.pendingRetry).toBeNull();

    // Typed replies still have to retry the unanswered message first.
    fake.push(new LLMError("timeout", "slow"));
    await expect(sendMessage(anonA, s.id, { text: "typed", clientMessageId: id() })).rejects.toBeTruthy();
    await expectCode(sendMessage(anonA, s.id, { text: "typed again", clientMessageId: id() }), "conflict");
  });

  it("ends the conversation when the client runs out of patience", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "missed-deadline", language: "en" });
    expect(s.patience).toBe(s.maxPatience);
    fake.push(reply("That's not good enough.", false, "frustrated", "", "lose_2"));
    const first = await sendMessage(anonA, s.id, { text: "whatever", clientMessageId: id() });
    expect(first.session.patience).toBe(s.maxPatience - 2);
    expect(first.wantsToEnd).toBe(false);

    fake.push(reply("I'm done here.", false, "frustrated", "", "lose_2"));
    const second = await sendMessage(anonA, s.id, { text: "not my problem", clientMessageId: id() });
    expect(second.session.patience).toBe(0);
    expect(second.wantsToEnd).toBe(true);
    expect(second.session.endReason).toBe("patience_exhausted");

    // The call is over: no more messages, but it can be scored despite being short.
    await expectCode(sendMessage(anonA, s.id, { text: "wait", clientMessageId: id() }), "conflict");
    fake.push(validScorecard());
    expect((await requestScorecard(anonA, s.id)).status).toBe("scored");
  });

  it("closes the conversation when the client wraps it up", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
    fake.push(reply("Great, send the proposal by Friday. Bye!", true, "cooperative"));
    const r = await sendMessage(anonA, s.id, { text: "I'll send it Friday", clientMessageId: id() });
    expect(r.session.endReason).toBe("client_ended");
    await expectCode(sendMessage(anonA, s.id, { text: "one more thing", clientMessageId: id() }), "conflict");
  });

  it("refuses to score a session that is too short", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
    await sendMessage(anonA, s.id, { text: "hi", clientMessageId: id() });
    await expectCode(requestScorecard(anonA, s.id), "too_short");
    await abandonSession(anonA, s.id);
    expect((await getSessionView(anonA, s.id)).status).toBe("abandoned");
  });

  it("scores once, stores a validated scorecard and ignores duplicate requests", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
    for (let i = 0; i < 3; i++) await sendMessage(anonA, s.id, { text: `point ${i}`, clientMessageId: id() });
    fake.push(validScorecard());
    const scored = await requestScorecard(anonA, s.id);
    expect(scored.status).toBe("scored");
    expect(scored.scorecard?.overall_score).toBe(6.2);
    expect(scored.scorecard?.related_user_message).toBe("point 1");

    const calls = fake.calls.length;
    const again = await requestScorecard(anonA, s.id);
    expect(again.scorecard).toEqual(scored.scorecard);
    expect(fake.calls.length).toBe(calls);
    await expectCode(sendMessage(anonA, s.id, { text: "more", clientMessageId: id() }), "conflict");
  });

  it("retries invalid scorecard JSON once, then preserves the transcript for a later retry", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
    for (let i = 0; i < 3; i++) await sendMessage(anonA, s.id, { text: `p${i}`, clientMessageId: id() });
    fake.push("not json", validScorecard({ clarity_score: 42 }));
    await expectCode(requestScorecard(anonA, s.id), "ai_invalid_response");

    const failed = await getSessionView(anonA, s.id);
    expect(failed.status).toBe("scoring_failed");
    expect(failed.messages).toHaveLength(7);
    expect(failed.scoringAttemptsLeft).toBe(limits.scoringAttemptsPerSession - 1);

    fake.push(validScorecard());
    expect((await requestScorecard(anonA, s.id)).status).toBe("scored");
  });

  it("marks sessions the model can't assess as insufficient", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
    for (let i = 0; i < 3; i++) await sendMessage(anonA, s.id, { text: "ignore the scenario", clientMessageId: id() });
    fake.push(validScorecard({ insufficient_evidence: true, goal_explanation: "Off-topic." }));
    const r = await requestScorecard(anonA, s.id);
    expect(r.status).toBe("insufficient");
    expect(r.statusDetail).toBe("Off-topic.");
  });

  it("enforces daily session limits for anonymous visitors on the server", async () => {
    for (let i = 0; i < limits.anonSessionsPerDay; i++) {
      const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
      await sendMessage(anonA, s.id, { text: "hi", clientMessageId: id() });
    }
    await expectCode(createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" }), "limit_reached");
    // A signed-in user has their own allowance.
    await expect(createSession(userA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" })).resolves.toBeDefined();
  });

  it("enforces the app-wide daily AI ceiling", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
    await db.usageEvent.createMany({
      data: Array.from({ length: limits.globalAiRequestsPerDay }, () => ({
        kind: "roleplay",
        actorType: "anonymous",
        provider: "fake",
        model: "fake",
        ok: true,
      })),
    });
    await expectCode(sendMessage(anonA, s.id, { text: "hi", clientMessageId: id() }), "limit_reached");
  });

  it("remembers the client's mood and private notes between turns without exposing the notes", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
    expect(s.clientMood).toBe("skeptical");
    fake.push(reply("Fair point. What would you cut?", false, "warming", "They asked about priorities; I said enquiries matter."));
    const r = await sendMessage(anonA, s.id, { text: "What matters most to you?", clientMessageId: id() });
    // skeptical → warming is two steps, so it's limited to one: neutral.
    expect(r.session.clientMood).toBe("neutral");
    expect(r.session.messages.at(-1)?.mood).toBe("neutral");
    expect(JSON.stringify(r.session)).not.toContain("I said enquiries matter");

    await sendMessage(anonA, s.id, { text: "We could phase it.", clientMessageId: id() });
    const sys = fake.calls.at(-1)!.system;
    expect(sys).toContain("Mood: neutral");
    expect(sys).toContain("I said enquiries matter");
  });

  it("gives at most the configured number of hints and never mid-reply", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
    for (let i = 0; i < limits.hintsPerSession; i++) {
      fake.push(JSON.stringify({ tip: "Ask about their budget first.", example: "What budget did you have in mind?" }));
      const h = await requestHint(anonA, s.id);
      expect(h.hint.tip).toMatch(/budget/);
      expect(h.hintsLeft).toBe(limits.hintsPerSession - i - 1);
    }
    await expectCode(requestHint(anonA, s.id), "limit_reached");
    expect((await getSessionView(anonA, s.id)).hintsLeft).toBe(0);
    await expectCode(requestHint(anonB, s.id), "not_found");
    expect(await db.usageEvent.count({ where: { kind: "hint" } })).toBe(limits.hintsPerSession);
  });

  it("doesn't use up a hint when the coach fails", async () => {
    const s = await createSession(anonA, "ip-a", { scenarioId: "pricing-negotiation", language: "en" });
    fake.push(new LLMError("rate_limited", "429", 5));
    await expectCode(requestHint(anonA, s.id), "ai_rate_limited");
    expect((await getSessionView(anonA, s.id)).hintsLeft).toBe(limits.hintsPerSession);
  });

  it("deletes a user's history without touching other users' data", async () => {
    await createSession(userA, "ip", { scenarioId: "pricing-negotiation", language: "en" });
    const other = await createSession(anonB, "ip-b", { scenarioId: "pricing-negotiation", language: "en" });
    expect(await deleteAllHistory(userA)).toBe(1);
    await expect(getSessionView(anonB, other.id)).resolves.toBeDefined();
  });
});

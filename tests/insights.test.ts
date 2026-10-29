import { describe, expect, it } from "vitest";
import { analyzeConversation, formatDuration, type InsightMessage } from "@/lib/insights/conversation";

const convo = (user: { text: string; speechMs?: number }[], client = "Okay, tell me more about that please.") => {
  const messages: InsightMessage[] = [{ speaker: "ai", text: "Hi, thanks for calling.", turn: 0 }];
  user.forEach((u, i) => {
    messages.push({ speaker: "user", text: u.text, turn: i + 1, speechMs: u.speechMs ?? null });
    messages.push({ speaker: "ai", text: client, turn: i + 1 });
  });
  return messages;
};

describe("conversation insights", () => {
  it("counts fillers and hedges, but not 'like' used as a verb", () => {
    const r = analyzeConversation(
      convo([{ text: "Um, I think we could, like, maybe start next week. I'd like to send a quote." }, { text: "Uh, basically it's just a small site." }]),
    );
    expect(r.wordChoice.fillers.top.map((t) => t.phrase)).toEqual(expect.arrayContaining(["um", "uh", "basically", "like"]));
    expect(r.wordChoice.fillers.count).toBe(4);
    expect(r.wordChoice.hedges.top.map((t) => t.phrase)).toEqual(expect.arrayContaining(["i think", "maybe", "just"]));
    expect(r.wordChoice.fillers.verdict).toBe("improve");
  });

  it("spots stutters and phrases repeated across turns", () => {
    const r = analyzeConversation(convo([{ text: "The the price is fair for the scope." }, { text: "Honestly the price is fair." }]));
    expect(r.wordChoice.repetition.top.map((t) => t.phrase)).toEqual(expect.arrayContaining(["the the", "the price is"]));
  });

  it("measures pace from voice turns and estimates talk time for typed ones", () => {
    const voice = analyzeConversation(convo([{ text: "one two three four five six seven eight nine ten eleven twelve", speechMs: 6000 }]));
    expect(voice.delivery?.wpm).toBe(120);
    expect(voice.delivery?.band).toBe("conversational");
    expect(voice.listening.estimated).toBe(false);
    expect(voice.listening.youSeconds).toBe(6);

    const typed = analyzeConversation(convo([{ text: "What budget do you have in mind? And when do you need it live?" }]));
    expect(typed.delivery).toBeNull();
    expect(typed.listening.estimated).toBe(true);
    expect(typed.listening.questions.count).toBe(2);
    expect(typed.listening.questions.verdict).toBe("good");
  });

  it("flags monologues and talking much more than the client", () => {
    const long = Array.from({ length: 160 }, (_, i) => `word${i}`).join(" ");
    const r = analyzeConversation(convo([{ text: long }], "Okay."));
    expect(r.listening.monologues.count).toBe(1);
    expect(r.listening.talkVerdict).toBe("improve");
  });

  it("flags one word opening most sentences", () => {
    const r = analyzeConversation(convo([{ text: "We can do it. We start Monday. We send drafts weekly. We finish in May." }]));
    expect(r.wordChoice.starters).toMatchObject({ word: "we", percent: 100, verdict: "improve" });
  });

  it("formats durations", () => {
    expect(formatDuration(84)).toBe("1:24");
    expect(formatDuration(5)).toBe("0:05");
  });
});

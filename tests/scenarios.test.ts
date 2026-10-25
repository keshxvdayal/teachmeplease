import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getActiveScenarios, loadCatalog, toPublicScenario } from "@/lib/scenarios";

describe("scenario catalog", () => {
  it("loads and validates every shipped scenario", () => {
    const { tracks, scenarios } = loadCatalog();
    expect(tracks.find((t) => t.id === "client-communication")?.status).toBe("active");
    expect(scenarios.map((s) => s.id)).toEqual(["pricing-negotiation", "difficult-client", "overdue-payment"]);
    for (const s of scenarios) {
      expect(s.language_modes).toEqual(expect.arrayContaining(["en", "hi", "hinglish"]));
      expect(s.min_turns_for_scorecard).toBeLessThanOrEqual(s.max_turns);
    }
  });

  it("public projection never exposes hidden roleplay or scoring fields", () => {
    for (const s of getActiveScenarios()) {
      const json = JSON.stringify(toPublicScenario(s));
      expect(json).not.toContain(s.ai_goal);
      expect(json).not.toContain(s.scenario_context);
      for (const rule of [...s.behavior_rules, ...s.ai_constraints, ...s.success_conditions]) expect(json).not.toContain(rule);
    }
  });

  it("localizes persona for Hindi and Hinglish", () => {
    const s = getActiveScenarios()[0];
    expect(toPublicScenario(s, "hinglish").personaName).toBe(s.localizations.hinglish?.persona_name);
    expect(toPublicScenario(s, "en").personaName).toBe(s.persona_name);
  });

  it("rejects an invalid scenario file with a useful message", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tmp-scen-"));
    fs.mkdirSync(path.join(dir, "scenarios"));
    fs.copyFileSync("content/tracks.json", path.join(dir, "tracks.json"));
    const good = JSON.parse(fs.readFileSync("content/scenarios/pricing-negotiation.json", "utf8"));
    fs.writeFileSync(path.join(dir, "scenarios", "broken.json"), JSON.stringify({ ...good, max_turns: "seven" }));
    expect(() => loadCatalog(dir)).toThrow(/broken\.json: max_turns/);

    fs.writeFileSync(path.join(dir, "scenarios", "broken.json"), JSON.stringify({ ...good, track_id: "nope" }));
    expect(() => loadCatalog(dir)).toThrow(/unknown track/);
  });

  it("adding a scenario is data-only", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tmp-scen-"));
    fs.mkdirSync(path.join(dir, "scenarios"));
    fs.copyFileSync("content/tracks.json", path.join(dir, "tracks.json"));
    const good = JSON.parse(fs.readFileSync("content/scenarios/pricing-negotiation.json", "utf8"));
    fs.writeFileSync(path.join(dir, "scenarios", "new.json"), JSON.stringify({ ...good, id: "scope-creep", title: "Scope Creep" }));
    expect(loadCatalog(dir).scenarios.map((s) => s.id)).toContain("scope-creep");
  });
});

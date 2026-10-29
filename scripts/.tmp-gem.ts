import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const key = env.GEMINI_API_KEY;
const body = (gen: object) => ({
  systemInstruction: { parts: [{ text: "You are Emma, a bakery owner on a call with a freelance web designer. Reply in JSON with reply, mood. Keep reply under 40 words." }] },
  contents: [{ role: "user", parts: [{ text: "It will cost around 2000 to 3000 US dollars." }] }],
  generationConfig: { temperature: 0.8, maxOutputTokens: 1200, responseMimeType: "application/json", ...gen },
});
async function time(model: string, gen: object) {
  const out: string[] = [];
  for (let i = 0; i < 4; i++) {
    const t = Date.now();
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body(gen)) });
    out.push(r.ok ? `${Date.now() - t}ms` : `HTTP ${r.status}`);
  }
  console.log(`${model}: ${out.join(", ")}`);
}
(async () => {
  await time("gemini-3-flash-preview", { thinkingConfig: { thinkingLevel: "minimal" } });
  await time("gemini-3.1-flash-lite", { thinkingConfig: { thinkingLevel: "minimal" } });
  await time("gemini-3.5-flash", { thinkingConfig: { thinkingLevel: "minimal" } });
})();

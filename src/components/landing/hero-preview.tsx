import { Sparkles, TrendingUp } from "lucide-react";
import { ScoreBars } from "@/components/scorecard/score-bars";
import { ScoreRing } from "@/components/ui/score-ring";

const exchange = [
  { who: "client", text: "I like the approach — but 4,800 is well above what we expected. Can you bring it down?" },
  { who: "user", text: "Before we talk numbers, which part of the proposal matters most to you this quarter?" },
  { who: "client", text: "Honestly? Getting more enquiries. Our current site loses them." },
];

/** Static, clearly-labelled example of the product. */
export function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:mr-0" aria-label="Example practice session" role="img">
      {/* Floating annotation chips */}
      <div className="absolute -left-32 top-[10.5rem] z-20 hidden animate-float items-center gap-2 rounded-full bg-night px-3.5 py-2 text-xs font-semibold text-white shadow-xl lg:flex">
        <Sparkles className="size-3.5 text-lime" /> Great discovery question
      </div>
      <div
        className="absolute -right-3 -top-4 z-20 hidden animate-float items-center gap-1.5 rounded-full bg-lime px-3 py-1.5 text-xs font-bold text-ink shadow-lg sm:flex"
        style={{ animationDelay: "-3s" }}
      >
        <TrendingUp className="size-3.5" /> Confidence ↑
      </div>

      {/* Chat card */}
      <div className="relative z-10 overflow-hidden rounded-[28px] border border-line bg-surface shadow-lift">
        <div className="grain relative flex items-center justify-between bg-linear-to-br from-night to-night-2 px-4 py-3.5 text-white sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-9 items-center justify-center rounded-full bg-linear-to-br from-accent to-[#f0446a] text-xs font-bold">
              DB
              <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-night bg-lime" />
            </span>
            <div>
              <p className="text-sm font-semibold leading-tight">Daniel Brooks</p>
              <p className="text-xs text-white/60">AI client · Pricing negotiation</p>
            </div>
          </div>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white/80">Turn 2 of 7</span>
        </div>
        <div className="bg-dots space-y-2.5 bg-canvas/60 px-4 py-5 sm:px-5">
          {exchange.map((m, i) => (
            <div key={i} className={`flex animate-rise ${m.who === "user" ? "justify-end" : ""}`} style={{ animationDelay: `${300 + i * 450}ms` }}>
              <p
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug shadow-sm ${
                  m.who === "user"
                    ? "rounded-br-md bg-linear-to-br from-brand to-[#8b45f3] text-white"
                    : "rounded-bl-md border border-line bg-surface text-ink"
                }`}
              >
                {m.text}
              </p>
            </div>
          ))}
          {/* Voice composer */}
          <div className="flex animate-rise items-center gap-2 pt-2" style={{ animationDelay: "1700ms" }}>
            <span className="flex size-9 items-center justify-center rounded-full bg-accent text-white shadow-[0_0_0_6px_rgb(255_106_61/0.18)]">
              <span className="size-2.5 rounded-sm bg-white" />
            </span>
            <span className="flex h-9 flex-1 items-center gap-[3px] rounded-full border border-line bg-surface px-4">
              {Array.from({ length: 26 }).map((_, i) => (
                <span
                  key={i}
                  className="animate-wave w-[3px] rounded-full bg-brand/70"
                  style={{ height: 6 + ((i * 7) % 14), animationDelay: `${(i % 9) * 110}ms` }}
                />
              ))}
            </span>
          </div>
        </div>
      </div>

      {/* Feedback card */}
      <div className="relative z-20 -mt-8 ml-auto w-[86%] rounded-3xl border border-line bg-surface/95 p-4 shadow-lift backdrop-blur sm:-mr-8 sm:p-5">
        <div className="flex items-center gap-4">
          <ScoreRing score={7.2} size={78} stroke={8} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Your feedback</p>
            <div className="mt-2">
              <ScoreBars compact scores={{ clarity: 8, confidence: 7, professionalism: 9, objection_handling: 7, closing_outcome: 5 }} />
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted">Example session</p>
    </div>
  );
}

"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Gauge, Lightbulb, MessageSquareText, Mic, Medal, Timer } from "lucide-react";
import { analyzeConversation, formatDuration, PACE, type CountMetric, type Example, type Verdict } from "@/lib/insights/conversation";
import type { SessionView } from "@/lib/sessions/service";

type Tab = "words" | "listening" | "delivery";

interface Row {
  title: string;
  value: string;
  verdict: Verdict;
  body: ReactNode;
}

const TABS: { id: Tab; label: string; icon: typeof Mic }[] = [
  { id: "words", label: "Word choice", icon: MessageSquareText },
  { id: "listening", label: "Listening", icon: Timer },
  { id: "delivery", label: "Delivery", icon: Gauge },
];

export function InsightsPanel({ session }: { session: SessionView }) {
  const [tab, setTab] = useState<Tab>("words");
  const insights = useMemo(
    () => analyzeConversation(session.messages.map((m) => ({ speaker: m.speaker, text: m.text, turn: m.turn, speechMs: m.speechMs }))),
    [session.messages],
  );
  const persona = session.scenario.personaName.split(/\s+/)[0];
  const { wordChoice: wc, listening: ls, delivery: dl } = insights;

  const rows: Record<Tab, Row[]> = {
    words: [
      countRow("Filler words", "filler", wc.fillers, "Pause silently instead of filling the gap. A beat of silence sounds more confident than “um”."),
      countRow("Hedging words", "hedge", wc.hedges, "Words like “just”, “maybe” and “I think” soften your point. State prices, dates and plans plainly."),
      countRow("Repetition", "repeat", wc.repetition, "Saying the same thing twice dilutes it. Make the point once, then move the conversation forward."),
      {
        title: "Conciseness",
        value: `${wc.conciseness.avgWordsPerTurn} words / turn`,
        verdict: wc.conciseness.verdict,
        body: (
          <>
            <Stats
              items={[
                ["Average turn", `${wc.conciseness.avgWordsPerTurn} words`],
                ["Longest turn", `${wc.conciseness.longestTurnWords} words`],
                ["Padding", `${wc.conciseness.excessPercent}%`],
              ]}
            />
            <Tip>On a call, 2–3 sentences per turn keeps it a conversation. Padding counts fillers, hedges and repeats.</Tip>
          </>
        ),
      },
      {
        title: "Sentence starters",
        value: wc.starters.word ? `“${capitalize(wc.starters.word)}” · ${wc.starters.percent}%` : "—",
        verdict: wc.starters.verdict,
        body: (
          <Tip>
            {wc.starters.word
              ? `${wc.starters.percent}% of your ${wc.starters.sentences} sentences began with “${capitalize(wc.starters.word)}”. `
              : ""}
            Varying how you open sentences keeps you from sounding scripted.
          </Tip>
        ),
      },
    ],
    listening: [
      {
        title: "Talk time",
        value: `${formatDuration(ls.youSeconds)} · ${ls.youPercent}%`,
        verdict: ls.talkVerdict,
        body: (
          <>
            <TalkTimeBar you={ls.youSeconds} client={ls.clientSeconds} clientName={persona} />
            <Tip>
              {ls.talkVerdict === "good"
                ? `You left room for ${persona} to talk. Listening more than you speak is how you learn what they need.`
                : `You did most of the talking. Ask a question and let ${persona} fill the silence.`}
              {ls.estimated && " Typed turns are estimated from word counts."}
            </Tip>
          </>
        ),
      },
      {
        title: "Monologues",
        value: String(ls.monologues.count),
        verdict: ls.monologues.verdict,
        body: (
          <>
            <Examples items={ls.monologues.examples} />
            <Tip>A turn over a minute (or ~150 words) is a monologue. Break it up with a question.</Tip>
          </>
        ),
      },
      {
        title: "Questions asked",
        value: String(ls.questions.count),
        verdict: ls.questions.verdict,
        body: (
          <>
            {ls.questions.examples.length > 0 && (
              <ul className="space-y-1.5">
                {ls.questions.examples.map((q, i) => (
                  <li key={i} className="rounded-xl bg-canvas px-3 py-2 text-sm text-ink-2 ring-1 ring-line">
                    <span className="mr-2 text-xs font-semibold text-muted">Turn {q.turn}</span>“{q.text}”
                  </li>
                ))}
              </ul>
            )}
            <Tip>Good questions uncover budget, timing and who decides, and they show you&apos;re listening.</Tip>
          </>
        ),
      },
    ],
    delivery: dl
      ? [
          {
            title: "Pace",
            value: `${dl.wpm} words / min`,
            verdict: dl.verdict,
            body: (
              <>
                <PaceMeter wpm={dl.wpm} />
                <Tip>
                  {dl.band === "conversational"
                    ? "Your pace sounded relaxed and easy to follow."
                    : dl.band === "fast"
                      ? "You spoke quickly. Slow down on prices and dates so they land."
                      : "You spoke slowly. A little more pace sounds more confident."}{" "}
                  Conversational pace is roughly {PACE.slow}–{PACE.fast} words per minute.
                </Tip>
              </>
            ),
          },
          {
            title: "Pace by turn",
            value: dl.turns.length > 1 ? `±${Math.round(dl.spread / 2)} wpm` : "1 turn",
            verdict: dl.spread <= 60 ? "good" : "improve",
            body: (
              <>
                <PaceChart turns={dl.turns} />
                <Tip>Some variation is natural. Big swings can mean rushing when nervous or stalling when unsure.</Tip>
              </>
            ),
          },
        ]
      : [],
  };

  const current = rows[tab];
  const good = current.filter((r) => r.verdict === "good");
  const improve = current.filter((r) => r.verdict === "improve");

  return (
    <section className="rounded-[28px] border border-line bg-surface p-6 shadow-card sm:p-8" aria-labelledby="analytics-title">
      <h2 id="analytics-title" className="text-2xl font-extrabold">
        Conversation <span className="font-serif font-normal italic text-gradient">analytics</span>
      </h2>
      <p className="mt-1 text-sm text-muted">Measured from what you said: {insights.words} words across {session.userTurns} turns.</p>

      <div role="tablist" aria-label="Analytics" className="mt-5 grid grid-cols-3 gap-1 rounded-2xl bg-canvas p-1 ring-1 ring-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-semibold transition-all ${
              tab === t.id ? "bg-surface text-brand-ink shadow-card" : "text-muted hover:text-ink"
            }`}
          >
            <t.icon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>

      <div id={`panel-${tab}`} role="tabpanel" className="mt-6 space-y-6">
        {tab === "delivery" && !dl ? (
          <div className="flex flex-col items-center rounded-2xl bg-canvas px-6 py-10 text-center ring-1 ring-line">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
              <Mic className="size-5" aria-hidden />
            </span>
            <p className="mt-3 font-display font-bold">Pace is measured on voice calls</p>
            <p className="mt-1 max-w-sm text-sm text-muted">Practise with a voice call next time to see your speaking pace and how it changed turn by turn.</p>
          </div>
        ) : (
          <>
            {good.length > 0 && <Group title="What went well" icon={<Medal className="size-4" aria-hidden />} tone="good" rows={good} />}
            {improve.length > 0 && <Group title="What to work on" icon={<Lightbulb className="size-4" aria-hidden />} tone="improve" rows={improve} />}
          </>
        )}
      </div>
    </section>
  );
}

function countRow(title: string, unit: string, m: CountMetric, tip: string): Row {
  return {
    title,
    value: `${m.count} ${unit}${m.count === 1 ? "" : "s"} · ${m.percent}%`,
    verdict: m.verdict,
    body: (
      <>
        {m.top.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {m.top.map((t) => (
              <li key={t.phrase} className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-medium text-ink-2">
                “{t.phrase}” <span className="text-muted">×{t.count}</span>
              </li>
            ))}
          </ul>
        )}
        <Examples items={m.examples} />
        <Tip>{m.count === 0 ? `No ${unit}s at all. Nice and clean.` : tip}</Tip>
      </>
    ),
  };
}

function Group({ title, icon, tone, rows }: { title: string; icon: ReactNode; tone: Verdict; rows: Row[] }) {
  return (
    <div>
      <h3 className={`flex items-center gap-2 text-sm font-bold ${tone === "good" ? "text-success" : "text-accent-ink"}`}>
        <span className={`flex size-7 items-center justify-center rounded-lg text-white ${tone === "good" ? "bg-success" : "bg-accent"}`}>{icon}</span>
        {title}
      </h3>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <details key={r.title} className="group rounded-2xl border border-line bg-surface transition-shadow open:shadow-card">
            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3.5 marker:hidden hover:bg-canvas">
              <ChevronRight className="size-4 shrink-0 text-brand transition-transform group-open:rotate-90" aria-hidden />
              <span className="flex-1 font-semibold text-ink">{r.title}</span>
              <span className="text-right text-sm font-semibold tabular-nums text-brand-ink">{r.value}</span>
            </summary>
            <div className="space-y-3 border-t border-line px-4 py-4">{r.body}</div>
          </details>
        ))}
      </div>
    </div>
  );
}

function Examples({ items }: { items: Example[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((e, i) => (
        <li key={i} className="rounded-xl bg-canvas px-3 py-2 text-sm text-ink-2 ring-1 ring-line">
          <span className="mr-2 text-xs font-semibold text-muted">Turn {e.turn}</span>“{e.text}”
        </li>
      ))}
    </ul>
  );
}

function Stats({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-canvas px-3 py-2.5 ring-1 ring-line">
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="mt-0.5 font-display text-lg font-bold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-brand-soft/60 px-3 py-2.5 text-sm leading-relaxed text-ink-2">{children}</p>;
}

/** You vs the client, as one split bar with labelled segments. */
function TalkTimeBar({ you, client, clientName }: { you: number; client: number; clientName: string }) {
  const total = you + client || 1;
  const youPct = (you / total) * 100;
  const segments = [
    { label: "You", seconds: you, pct: youPct, color: "bg-brand" },
    { label: clientName, seconds: client, pct: 100 - youPct, color: "bg-accent" },
  ];
  return (
    <figure>
      <div className="flex h-9 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={`You ${Math.round(youPct)}%, ${clientName} ${Math.round(100 - youPct)}%`}>
        {segments.map((s) => (
          <div key={s.label} className={`${s.color} flex items-center justify-center first:rounded-l-[4px] last:rounded-r-[4px]`} style={{ width: `${s.pct}%` }}>
            {s.pct >= 18 && <span className="text-xs font-bold text-white">{Math.round(s.pct)}%</span>}
          </div>
        ))}
      </div>
      <figcaption className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
        {segments.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className={`size-2.5 rounded-[3px] ${s.color}`} aria-hidden />
            {s.label} <span className="font-semibold tabular-nums">{formatDuration(s.seconds)}</span>
            <span className="text-muted">({Math.round(s.pct)}%)</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Where the learner's pace sits between slow and fast. */
function PaceMeter({ wpm }: { wpm: number }) {
  const min = 60;
  const max = 220;
  const pos = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100;
  return (
    <div className="rounded-2xl bg-canvas px-4 pb-4 pt-5 ring-1 ring-line">
      <div className="text-center">
        <span className="font-display text-4xl font-extrabold tabular-nums">{wpm}</span>
        <span className="ml-1 text-sm text-muted">words / min</span>
      </div>
      <div className="relative mt-4 h-3">
        <div className="absolute inset-0 flex gap-[2px]">
          <span className="rounded-l-full bg-ink/10" style={{ width: `${pos(PACE.slow)}%` }} />
          <span className="bg-brand/30" style={{ width: `${pos(PACE.fast) - pos(PACE.slow)}%` }} />
          <span className="flex-1 rounded-r-full bg-ink/10" />
        </div>
        <span
          className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface bg-brand shadow-card"
          style={{ left: `${pos(wpm)}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-2 flex text-xs text-muted">
        <span style={{ width: `${pos(PACE.slow)}%` }}>Slow</span>
        <span className="text-center font-semibold text-brand-ink" style={{ width: `${pos(PACE.fast) - pos(PACE.slow)}%` }}>
          Conversational
        </span>
        <span className="flex-1 text-right">Fast</span>
      </div>
    </div>
  );
}

/** Words per minute for each voice turn, against the conversational band. */
function PaceChart({ turns }: { turns: { turn: number; wpm: number; words: number; seconds: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const H = 200;
  const pad = { l: 36, r: 8, t: 12, b: 26 };
  const top = Math.max(220, Math.ceil(Math.max(...turns.map((t) => t.wpm)) / 20) * 20 + 20);
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const slot = (W - pad.l - pad.r) / turns.length;
  const barW = Math.min(28, slot * 0.5);
  const ticks = [0, 60, 120, 180, top >= 240 ? 240 : null].filter((t): t is number => t !== null && t <= top);

  return (
    <figure className="relative">
      <figcaption className="mb-2 flex items-center gap-1.5 text-xs text-muted">
        <span className="h-2.5 w-4 rounded-[3px] bg-brand-soft ring-1 ring-brand/20" aria-hidden />
        Conversational range ({PACE.slow}–{PACE.fast} words / min)
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Words per minute by turn">
        <rect x={pad.l} y={y(PACE.fast)} width={W - pad.l - pad.r} height={y(PACE.slow) - y(PACE.fast)} className="fill-brand-soft" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-ink/[0.07]" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {turns.map((t, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const h = y(0) - y(t.wpm);
          return (
            <g key={t.turn} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
              <rect x={cx - slot / 2} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" />
              <path
                d={`M${cx - barW / 2} ${y(0)} V${y(t.wpm) + 4} Q${cx - barW / 2} ${y(t.wpm)} ${cx - barW / 2 + 4} ${y(t.wpm)} H${cx + barW / 2 - 4} Q${cx + barW / 2} ${y(t.wpm)} ${cx + barW / 2} ${y(t.wpm) + 4} V${y(0)} Z`}
                className={`fill-brand transition-opacity ${hover !== null && hover !== i ? "opacity-40" : ""}`}
                style={{ display: h > 0 ? undefined : "none" }}
              />
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-muted text-[11px]">
                T{t.turn}
              </text>
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="stroke-ink/20" />
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-night px-2.5 py-1.5 text-xs text-white shadow-lift"
          style={{ left: `${((pad.l + ((W - pad.l - pad.r) / turns.length) * (hover + 0.5)) / W) * 100}%`, top: `${(y(turns[hover].wpm) / H) * 100}%` }}
        >
          <span className="font-semibold">Turn {turns[hover].turn}</span> · {turns[hover].wpm} wpm
          <span className="block text-white/60">
            {turns[hover].words} words in {turns[hover].seconds}s
          </span>
        </div>
      )}
      <table className="sr-only">
        <caption>Words per minute by turn</caption>
        <thead>
          <tr>
            <th>Turn</th>
            <th>Words per minute</th>
          </tr>
        </thead>
        <tbody>
          {turns.map((t) => (
            <tr key={t.turn}>
              <td>{t.turn}</td>
              <td>{t.wpm}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

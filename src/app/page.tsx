import { ArrowRight, Check, Clock, Gift, Languages, ListChecks, Lock, MessageSquareText, Mic, Target, UserX } from "lucide-react";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { TrackView } from "@/components/site/track-view";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/ui/score-ring";
import { HeroPreview } from "@/components/landing/hero-preview";
import { WaitlistForm } from "@/components/landing/waitlist-form";
import { ScenarioCard } from "@/components/scenario-card";
import { ScoreBars } from "@/components/scorecard/score-bars";
import { getActiveScenarios, getFeaturedScenarios, getTracks, toPublicScenario } from "@/lib/scenarios";

const steps = [
  {
    icon: Target,
    title: "Choose a scenario",
    body: "Pick a real situation — a price objection, a frustrated client, an overdue invoice.",
  },
  {
    icon: MessageSquareText,
    title: "Practice with an AI client",
    body: "Speak or type your replies. The client pushes back, adapts, and responds to what you actually say.",
  },
  {
    icon: ListChecks,
    title: "Get specific feedback",
    body: "See scores across five skills, what worked, what to change, and a better line to use next time.",
  },
];

/** Lines people dread hearing — shown in the scrolling strip. */
const dreadedLines = [
  "Can you do it for less?",
  "Another freelancer quoted half.",
  "We'll pay next month, promise.",
  "Thoda discount ho jayega?",
  "This isn't what I asked for.",
  "Can we add just one more page?",
  "Finance is a bit slow right now.",
  "Mujhe ye kal tak chahiye.",
  "Why is this taking so long?",
];

function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p
      className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] ${light ? "text-lime" : "text-brand"}`}
    >
      <span className={`h-px w-6 ${light ? "bg-lime" : "bg-brand"}`} aria-hidden />
      {children}
    </p>
  );
}

export default function HomePage() {
  const scenarios = getFeaturedScenarios().map((s) => toPublicScenario(s));
  const totalScenarios = getActiveScenarios().length;
  const upcoming = getTracks().filter((t) => t.status === "coming_soon");

  return (
    <>
      <TrackView name="landing_view" />
      <div className="relative">
        {/* Ambient background for header + hero */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[900px] overflow-hidden" aria-hidden>
          <div className="bg-dots mask-fade-y absolute inset-0" />
          <div className="absolute -left-32 top-10 size-[420px] animate-blob rounded-full bg-brand/25 blur-[90px]" />
          <div
            className="absolute right-[-120px] top-40 size-[380px] animate-blob rounded-full bg-accent/25 blur-[90px]"
            style={{ animationDelay: "-6s" }}
          />
          <div
            className="absolute left-1/3 top-[520px] size-[300px] animate-blob rounded-full bg-lime/40 blur-[90px]"
            style={{ animationDelay: "-12s" }}
          />
        </div>

        <SiteHeader />
        <main id="main" className="relative">
          {/* Hero */}
          <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 md:pt-20 lg:grid-cols-[1.15fr_1fr] lg:gap-10 lg:pb-28">
            <div className="animate-rise">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 py-1 pl-1.5 pr-3 text-xs font-medium text-ink-2 shadow-card backdrop-blur">
                <span className="rounded-full bg-night px-2 py-0.5 text-[11px] font-semibold text-lime">New</span>
                Client communication track · Now available
              </span>
              <h1 className="mt-6 text-[2.75rem] font-extrabold leading-[0.98] tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4.1rem]">
                Build confidence{" "}
                <span className="relative inline-block whitespace-nowrap">
                  <span className="font-serif font-normal italic tracking-normal text-gradient">before</span>
                  <svg
                    className="absolute -bottom-2 left-0 w-full text-accent"
                    viewBox="0 0 200 14"
                    preserveAspectRatio="none"
                    aria-hidden
                  >
                    <path d="M3 9.5C40 3 90 2.5 197 7" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </span>{" "}
                the conversation happens.
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-2 text-pretty">
                Practice real-world professional conversations with AI. Handle difficult clients, negotiate confidently, and learn{" "}
                <span className="marker font-medium text-ink">what to say differently</span> next time.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href="/practice" size="lg">
                  Start practicing <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
                <ButtonLink href="#how-it-works" size="lg" variant="secondary">
                  See how it works
                </ButtonLink>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-2">
                {[
                  { icon: Gift, text: "Free" },
                  { icon: UserX, text: "No sign-up for your first session" },
                  { icon: Clock, text: "About 5–8 minutes" },
                ].map(({ icon: Icon, text }) => (
                  <li key={text} className="inline-flex items-center gap-1.5">
                    <Icon className="size-4 text-brand" aria-hidden /> {text}
                  </li>
                ))}
              </ul>
            </div>
            <HeroPreview />
          </section>

          {/* Dreaded-lines marquee */}
          <section aria-label="Things clients say" className="relative -rotate-1 border-y border-night bg-night py-4">
            <div className="mask-fade-x flex overflow-hidden">
              <ul className="flex shrink-0 animate-marquee items-center gap-4 pr-4">
                {[...dreadedLines, ...dreadedLines].map((line, i) => (
                  <li
                    key={i}
                    aria-hidden={i >= dreadedLines.length}
                    className="flex shrink-0 items-center gap-4 font-display text-lg font-semibold text-white sm:text-xl"
                  >
                    <span className="whitespace-nowrap">“{line}”</span>
                    <span className={`size-2 rounded-full ${i % 3 === 0 ? "bg-lime" : i % 3 === 1 ? "bg-accent" : "bg-brand"}`} />
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* How it works */}
          <section id="how-it-works" className="scroll-mt-24">
            <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
              <div className="max-w-2xl">
                <Eyebrow>How it works</Eyebrow>
                <h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">
                  A safe place to <span className="font-serif font-normal italic">fumble.</span>
                </h2>
                <p className="mt-4 text-lg text-ink-2">
                  A low-pressure place to make mistakes and try again — before it matters.
                </p>
              </div>
              <ol className="relative mt-14 grid gap-5 md:grid-cols-3">
                <div
                  className="absolute left-0 right-0 top-[3.25rem] hidden border-t-2 border-dashed border-line-strong md:block"
                  aria-hidden
                />
                {steps.map((s, i) => (
                  <li
                    key={s.title}
                    className={`relative rounded-3xl border border-line bg-surface p-6 shadow-card transition-transform duration-300 hover:-translate-y-1 ${i === 1 ? "md:translate-y-6 md:hover:translate-y-5" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`flex size-14 items-center justify-center rounded-2xl ${
                          i === 0 ? "bg-brand text-white" : i === 1 ? "bg-accent text-white" : "bg-lime text-ink"
                        } shadow-lg`}
                      >
                        <s.icon className="size-6" aria-hidden />
                      </span>
                      <span className="font-serif text-6xl italic leading-none text-ink/10" aria-hidden>
                        0{i + 1}
                      </span>
                    </div>
                    <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-muted">Step {i + 1}</p>
                    <h3 className="mt-1.5 text-xl font-bold">{s.title}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* Scenarios */}
          <section id="scenarios" className="mx-auto max-w-6xl scroll-mt-24 px-4 pb-20 sm:px-6 lg:pb-28">
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div className="max-w-2xl">
                <Eyebrow>Practice scenarios</Eyebrow>
                <h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">
                  Pick your <span className="font-serif font-normal italic text-gradient">tough room.</span>
                </h2>
                <p className="mt-4 text-lg text-ink-2">
                  For freelancers, consultants and agency owners. Each AI client has their own personality, goals and limits.
                </p>
              </div>
              <ButtonLink href="/practice" variant="secondary" className="shrink-0">
                All {totalScenarios} scenarios <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {scenarios.map((s) => (
                <ScenarioCard key={s.id} scenario={s} />
              ))}
            </div>
          </section>

          {/* Scorecard preview */}
          <section className="relative overflow-hidden bg-night text-white">
            <div className="bg-dots-light absolute inset-0" aria-hidden />
            <div className="absolute -right-40 top-0 size-[500px] rounded-full bg-brand/40 blur-[120px]" aria-hidden />
            <div className="absolute -bottom-40 left-0 size-[400px] rounded-full bg-accent/20 blur-[120px]" aria-hidden />
            <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
              <div>
                <Eyebrow light>Your scorecard</Eyebrow>
                <h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">
                  Feedback that points to <span className="font-serif font-normal italic text-lime">the moment.</span>
                </h2>
                <p className="mt-5 text-lg text-white/70">
                  Every session ends with a scorecard based on your actual conversation — not generic tips. You&apos;ll see
                  exactly which reply to change and what to say instead.
                </p>
                <ul className="mt-8 space-y-3.5 text-[15px] text-white/85">
                  {[
                    "Five skills: clarity, confidence, professionalism, objection handling, closing",
                    "One thing that worked, one thing to improve",
                    "A better phrase for a specific turn",
                    "Whether you reached the goal — judged separately from whether the client agreed",
                  ].map((t) => (
                    <li key={t} className="flex gap-3">
                      <span
                        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-lime text-ink"
                        aria-hidden
                      >
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
                <p className="mt-8 text-sm text-white/50">Scores are AI-generated practice feedback, not a formal assessment.</p>
              </div>

              <div className="relative">
                <div
                  className="absolute -inset-3 rotate-2 rounded-[32px] bg-linear-to-br from-brand via-[#a13df5] to-accent opacity-60"
                  aria-hidden
                />
                <div className="relative rounded-[28px] bg-surface p-5 text-ink shadow-2xl sm:p-7" aria-label="Example scorecard">
                  <div className="flex items-center gap-5">
                    <ScoreRing score={6.8} size={104} stroke={10} />
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                        Example · Pricing negotiation
                      </p>
                      <p className="mt-2">
                        <Badge tone="warning" className="text-sm">
                          Goal partly reached
                        </Badge>
                      </p>
                    </div>
                  </div>
                  <div className="mt-6">
                    <ScoreBars
                      compact
                      scores={{ clarity: 8, confidence: 6, professionalism: 9, objection_handling: 6, closing_outcome: 5 }}
                    />
                  </div>
                  <div className="mt-6 grid gap-2.5 text-sm sm:grid-cols-2">
                    <p className="rounded-2xl bg-success-soft p-3.5">
                      <span className="block text-xs font-bold uppercase tracking-wide text-success">Worked well</span>
                      <span className="mt-1 block text-ink-2">You asked what mattered most before discussing price.</span>
                    </p>
                    <p className="rounded-2xl bg-accent-soft p-3.5">
                      <span className="block text-xs font-bold uppercase tracking-wide text-accent-ink">Improve</span>
                      <span className="mt-1 block text-ink-2">In turn 4 you dropped to 4,000 without removing anything.</span>
                    </p>
                  </div>
                  <p className="mt-2.5 rounded-2xl bg-brand-soft p-4 font-serif text-lg italic leading-snug text-brand-ink">
                    “I can get to 3,900 if we launch with four pages and add the blog in phase two. Would that work for your
                    team?”
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Practical notes — bento */}
          <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
            <div className="grid gap-5 md:grid-cols-3">
              <div className="relative overflow-hidden rounded-3xl bg-brand-soft p-7 md:col-span-2">
                <Languages className="size-7 text-brand" aria-hidden />
                <h3 className="mt-4 text-2xl font-bold">English, Hindi and Hinglish</h3>
                <p className="mt-2 max-w-md text-[15px] text-ink-2">
                  Practice in the language you&apos;ll actually use. Feedback focuses on communication, not accent or grammar.
                </p>
                <div className="mt-6 flex flex-wrap gap-2" aria-hidden>
                  {["Hello! Shall we begin?", "नमस्ते, शुरू करें?", "Haan ji, chaliye start karte hain"].map((t, i) => (
                    <span
                      key={t}
                      className={`rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm font-medium shadow-sm ${
                        i === 1 ? "bg-brand text-white" : "bg-surface text-ink"
                      }`}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl bg-lime-soft p-7 ring-1 ring-lime">
                <Mic className="size-7 text-ink" aria-hidden />
                <h3 className="mt-4 text-2xl font-bold">Speak or type</h3>
                <p className="mt-2 text-[15px] text-ink-2">
                  Voice uses your browser&apos;s built-in speech features and works best in Chrome. Typing always works.
                </p>
              </div>
              <div className="rounded-3xl bg-night p-7 text-white md:col-span-3 md:flex md:items-center md:gap-8">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                  <Lock className="size-6 text-lime" aria-hidden />
                </span>
                <div className="mt-4 md:mt-0">
                  <h3 className="text-2xl font-bold">Private by default</h3>
                  <p className="mt-2 max-w-3xl text-[15px] text-white/70">
                    No audio is stored. Your practice messages are processed by an AI provider — use fictional details, not real
                    client information.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Upcoming tracks */}
          <section id="upcoming" className="scroll-mt-24 border-t border-line bg-surface">
            <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:py-28">
              <div>
                <Eyebrow>Coming next</Eyebrow>
                <h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">
                  More rooms are <span className="font-serif font-normal italic">opening.</span>
                </h2>
                <p className="mt-4 text-lg text-ink-2">
                  New training tracks are in development. Join the waitlist to get early access.
                </p>
                <ul className="mt-10 space-y-4">
                  {upcoming.map((t, i) => (
                    <li
                      key={t.id}
                      className="group flex gap-4 rounded-3xl border border-line bg-canvas p-5 transition-colors hover:border-line-strong"
                    >
                      <span
                        className={`flex size-11 shrink-0 items-center justify-center rounded-2xl font-display text-lg font-bold ${
                          i % 2 === 0 ? "bg-accent text-white" : "bg-brand text-white"
                        }`}
                        aria-hidden
                      >
                        {t.title[0]}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-bold">{t.title}</h3>
                          <Badge>Coming soon</Badge>
                        </div>
                        <p className="mt-1 text-[15px] text-ink-2">{t.description}</p>
                        <p className="mt-2 text-xs text-muted">For: {t.audience}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="self-center rounded-[28px] bg-linear-to-br from-brand via-[#a13df5] to-accent p-px shadow-lift">
                <div className="rounded-[27px] bg-surface p-6 sm:p-8">
                  <h3 className="text-2xl font-bold">Join the waitlist</h3>
                  <p className="mb-6 mt-1 text-sm text-ink-2">Tell us which track you&apos;re waiting for.</p>
                  <WaitlistForm tracks={upcoming.map((t) => ({ id: t.id, title: t.title }))} />
                </div>
              </div>
            </div>
          </section>

          {/* Final CTA */}
          <section className="px-4 py-20 sm:px-6 lg:py-24">
            <div className="grain relative mx-auto max-w-6xl overflow-hidden rounded-[40px] bg-linear-to-br from-brand via-[#7c3df2] to-[#c03df0] px-6 py-16 text-center text-white sm:py-24">
              <div className="bg-dots-light absolute inset-0" aria-hidden />
              <div className="absolute -left-20 -top-20 size-72 rounded-full bg-accent/50 blur-3xl" aria-hidden />
              <div className="absolute -bottom-24 -right-10 size-72 rounded-full bg-lime/40 blur-3xl" aria-hidden />
              <div className="relative">
                <h2 className="mx-auto max-w-3xl text-4xl font-extrabold text-balance sm:text-6xl">
                  Your next difficult conversation is <span className="font-serif font-normal italic text-lime">coming.</span>
                </h2>
                <p className="mt-5 text-lg text-white/80">Rehearse it now. It takes about five minutes.</p>
                <ButtonLink href="/practice" size="lg" variant="inverse" className="mt-9">
                  Start practicing <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
              </div>
            </div>
          </section>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ChevronDown, Loader2, Mic, RotateCcw, Send, Square, Target, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiRequestError, trackEvent, type ApiError } from "@/lib/client/api";
import { useSpeechRecognition, voiceErrorMessages, type VoiceErrorKind } from "@/lib/client/use-speech-recognition";
import { useSpeechSynthesis } from "@/lib/client/use-speech-synthesis";
import { uuid } from "@/lib/client/uuid";
import type { SessionView } from "@/lib/sessions/service";

const LANGUAGE_LABELS: Record<string, string> = { en: "English", hi: "Hindi", hinglish: "Hinglish" };
const AUTOPLAY_KEY = "tmp_autoplay";
// A press held longer than this is treated as hold-to-talk; shorter presses toggle.
const HOLD_THRESHOLD_MS = 350;

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function PracticeSession({ initial, ttsLocale, maxChars }: { initial: SessionView; ttsLocale: string; maxChars: number }) {
  const router = useRouter();
  const [session, setSession] = useState(initial);
  const [draft, setDraft] = useState("");
  const [usedVoice, setUsedVoice] = useState(false);
  const [sendingText, setSendingText] = useState<string | null>(null);
  const [error, setError] = useState<(ApiError & { retryable: boolean }) | null>(null);
  const [retryIn, setRetryIn] = useState(0);
  const [wantsToEnd, setWantsToEnd] = useState(initial.userTurns >= initial.maxTurns);
  const [endOpen, setEndOpen] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [autoplay, setAutoplay] = useState(true);

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pressStartRef = useRef(0);

  const persona = session.scenario.personaName;
  const sending = sendingText !== null;
  const turnsUsed = session.userTurns;
  const outOfTurns = turnsUsed >= session.maxTurns;
  const canScore = turnsUsed >= session.minTurnsForScorecard;
  const pending = session.pendingRetry;
  const speechLocale = session.speechLocale ?? ttsLocale;

  const tts = useSpeechSynthesis(ttsLocale);

  const onVoiceError = useCallback((kind: VoiceErrorKind) => {
    if (kind !== "no-speech") trackEvent("voice_failure", { reason: kind });
  }, []);

  const onFinal = useCallback((text: string) => {
    setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text));
    setUsedVoice(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const stt = useSpeechRecognition(speechLocale, onFinal, onVoiceError);

  useEffect(() => {
    try {
      const v = localStorage.getItem(AUTOPLAY_KEY);
      if (v !== null) setAutoplay(v === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleAutoplay = () => {
    setAutoplay((v) => {
      const next = !v;
      try {
        localStorage.setItem(AUTOPLAY_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      if (!next) tts.stop();
      return next;
    });
  };

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [session.messages.length, sendingText]);

  // Countdown for rate-limit retries.
  useEffect(() => {
    if (retryIn <= 0) return;
    const t = setTimeout(() => setRetryIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [retryIn]);

  // Auto-grow the textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft, stt.interim]);

  async function refresh(): Promise<SessionView | null> {
    try {
      const { data } = await api<{ session: SessionView }>(`/api/sessions/${session.id}`);
      setSession(data.session);
      return data.session;
    } catch {
      return null;
    }
  }

  async function submit(text: string, clientMessageId: string, inputMode: "voice" | "text") {
    if (sending) return;
    tts.stop();
    setError(null);
    setSendingText(text);
    try {
      const { data } = await api<{ session: SessionView; wantsToEnd: boolean }>(`/api/sessions/${session.id}/messages`, {
        method: "POST",
        json: { text, clientMessageId, inputMode },
      });
      setSession(data.session);
      setWantsToEnd(data.wantsToEnd);
      setUsedVoice(false);
      const last = data.session.messages[data.session.messages.length - 1];
      if (autoplay && last?.speaker === "ai") tts.speak(last.id, last.text);
    } catch (err) {
      const e = err instanceof ApiRequestError ? err.error : { code: "server_error", message: "Something went wrong.", status: 500 };
      // Find out whether the server saved the message before failing.
      const fresh = await refresh();
      const saved = fresh?.pendingRetry?.clientMessageId === clientMessageId;
      if (!saved && fresh?.messages.some((m) => m.speaker === "user" && m.text === text && m.turn === fresh.userTurns)) {
        // Saved and answered (e.g. response lost on the way back) — nothing to do.
        setSendingText(null);
        return;
      }
      if (!saved) setDraft(text);
      setError({ ...e, retryable: saved });
      if (e.retryAfterSeconds) setRetryIn(Math.min(e.retryAfterSeconds, 60));
    } finally {
      setSendingText(null);
    }
  }

  function send() {
    const text = draft.trim();
    if (!text || sending || pending || outOfTurns) return;
    if (stt.listening) stt.stop();
    setDraft("");
    void submit(text, uuid(), usedVoice ? "voice" : "text");
  }

  function retry() {
    if (pending) void submit(pending.text, pending.clientMessageId, "text");
  }

  async function getFeedback() {
    if (scoring) return;
    setScoring(true);
    setError(null);
    tts.stop();
    try {
      await api(`/api/sessions/${session.id}/scorecard`, { method: "POST" });
      router.push(`/session/${session.id}/results`);
    } catch (err) {
      const e = err instanceof ApiRequestError ? err.error : { code: "server_error", message: "Something went wrong.", status: 500 };
      setError({ ...e, retryable: false });
      setScoring(false);
      setEndOpen(false);
    }
  }

  async function exitWithoutFeedback() {
    tts.stop();
    try {
      await api(`/api/sessions/${session.id}/abandon`, { method: "POST" });
    } finally {
      router.push("/practice");
    }
  }

  // Push-to-talk: hold to talk, or tap to start and tap again to stop.
  function onMicDown(e: React.PointerEvent) {
    e.preventDefault();
    if (stt.listening) {
      stt.stop();
      pressStartRef.current = 0;
      return;
    }
    tts.stop();
    pressStartRef.current = Date.now();
    stt.start();
  }
  function onMicUp() {
    if (pressStartRef.current && Date.now() - pressStartRef.current > HOLD_THRESHOLD_MS) stt.stop();
    pressStartRef.current = 0;
  }
  function onMicKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (stt.listening) stt.stop();
      else {
        tts.stop();
        stt.start();
      }
    }
  }

  const status = useMemo(() => {
    if (scoring) return "Preparing your feedback…";
    if (sending) return `${persona} is replying…`;
    if (pending) return "Last message wasn't delivered";
    if (outOfTurns) return "All turns used";
    if (stt.listening) return "Listening…";
    return "Your turn";
  }, [scoring, sending, pending, outOfTurns, stt.listening, persona]);

  const composerDisabled = sending || !!pending || outOfTurns || scoring;
  const overLimit = draft.length > maxChars;

  return (
    <div className="relative flex h-dvh flex-col bg-canvas">
      <div className="bg-dots pointer-events-none absolute inset-0" aria-hidden />
      <div className="pointer-events-none absolute -left-40 top-1/3 size-96 rounded-full bg-brand/10 blur-[100px]" aria-hidden />
      <div className="pointer-events-none absolute -right-40 bottom-24 size-96 rounded-full bg-accent/10 blur-[100px]" aria-hidden />
      {/* Top bar */}
      <header className="relative z-10 border-b border-line bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-2.5 sm:px-5">
          <Link href="/practice" className="hidden rounded-full p-1.5 text-muted transition-colors hover:bg-ink/5 hover:text-ink sm:block" aria-label="Back to scenarios">
            <X className="size-5" aria-hidden />
          </Link>
          <span
            className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-accent to-[#d63a4c] font-display text-xs font-bold text-white"
            aria-hidden
          >
            {initials(persona)}
            <span
              className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-surface ${sending ? "animate-pulse bg-accent" : "bg-lime"}`}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-bold leading-tight">{persona}</p>
            <p className="truncate text-xs text-muted">
              AI client · {session.scenario.title}
            </p>
          </div>
          <span className="hidden sm:block">
            <Badge>{LANGUAGE_LABELS[session.language] ?? session.language}</Badge>
          </span>
          {tts.supported && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAutoplay}
              aria-pressed={autoplay}
              aria-label={autoplay ? "Turn off reading replies aloud" : "Read replies aloud"}
              title={autoplay ? "Replies are read aloud" : "Replies are not read aloud"}
            >
              {autoplay ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setEndOpen(true)} disabled={scoring}>
            End
          </Button>
        </div>

        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-3 pb-2 sm:px-5">
          <button
            type="button"
            onClick={() => setBriefOpen((v) => !v)}
            aria-expanded={briefOpen}
            aria-controls="brief"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-ink transition-colors hover:bg-brand/15"
          >
            <Target className="size-3.5" aria-hidden /> Your goal
            <ChevronDown className={`size-3.5 transition-transform ${briefOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="sm:hidden">{LANGUAGE_LABELS[session.language]}</span>
            <span className="tabular-nums" aria-live="polite">
              Turn {Math.min(turnsUsed + (outOfTurns ? 0 : 1), session.maxTurns)} of {session.maxTurns}
            </span>
          </div>
        </div>
        <div className="mx-auto flex max-w-3xl gap-1 px-3 pb-2.5 sm:px-5" aria-hidden>
          {Array.from({ length: session.maxTurns }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
                i < turnsUsed ? "bg-linear-to-r from-brand to-[#a13df5]" : i === turnsUsed && !outOfTurns ? "bg-brand/25" : "bg-ink/[0.07]"
              }`}
            />
          ))}
        </div>
        {briefOpen && (
          <div id="brief" className="mx-3 mb-3 max-w-3xl space-y-2 rounded-2xl bg-canvas px-4 py-3 text-sm text-ink-2 ring-1 ring-line animate-rise sm:mx-5 lg:mx-auto">
            <p>
              <strong className="text-ink">Goal:</strong> {session.scenario.userGoal}
            </p>
            <p>
              <strong className="text-ink">Situation:</strong> {session.scenario.userRole}
            </p>
          </div>
        )}
      </header>

      {/* Conversation */}
      <main id="main" ref={listRef} className="relative flex-1 overflow-y-auto" aria-label="Conversation">
        <ol className="mx-auto flex max-w-3xl flex-col gap-3.5 px-3 py-6 sm:px-5" aria-live="polite" aria-relevant="additions">
          {session.messages.map((m, i) => {
            const isPending = pending && i === session.messages.length - 1 && m.speaker === "user";
            return m.speaker === "ai" ? (
              <li key={m.id} className="flex max-w-[88%] items-end gap-2 animate-rise sm:max-w-[78%]">
                <div className="rounded-3xl rounded-bl-md border border-line bg-surface px-4 py-3 shadow-card">
                  <p className="sr-only">{persona} said:</p>
                  <p className="text-[15px] leading-relaxed">{m.text}</p>
                </div>
                {tts.supported && (
                  <button
                    type="button"
                    onClick={() => (tts.speakingId === m.id ? tts.stop() : tts.speak(m.id, m.text))}
                    className="mb-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
                    aria-label={tts.speakingId === m.id ? "Stop audio" : "Play reply aloud"}
                  >
                    {tts.speakingId === m.id ? <Square className="size-3.5 fill-current" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
                  </button>
                )}
              </li>
            ) : (
              <li key={m.id} className="ml-auto flex max-w-[88%] flex-col items-end gap-1 animate-rise sm:max-w-[78%]">
                <div
                  className={`rounded-3xl rounded-br-md bg-linear-to-br from-brand to-[#8b45f3] px-4 py-3 text-white shadow-glow ${isPending ? "opacity-70" : ""}`}
                >
                  <p className="sr-only">You said:</p>
                  <p className="text-[15px] leading-relaxed">{m.text}</p>
                </div>
                {isPending && !sending && <span className="text-xs text-muted">Not answered yet</span>}
              </li>
            );
          })}

          {sendingText !== null && !pending && (
            <li className="ml-auto max-w-[88%] rounded-3xl rounded-br-md bg-linear-to-br from-brand to-[#8b45f3] px-4 py-3 text-white opacity-80 animate-rise sm:max-w-[78%]">
              <p className="text-[15px] leading-relaxed">{sendingText}</p>
            </li>
          )}
          {sending && (
            <li className="flex items-center gap-2 text-sm text-muted" aria-label={`${persona} is replying`}>
              <span className="inline-flex gap-1 rounded-3xl rounded-bl-md border border-line bg-surface px-4 py-3.5 shadow-card" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-2 animate-bounce rounded-full bg-brand/60" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </span>
            </li>
          )}

          {(outOfTurns || (wantsToEnd && canScore)) && !sending && !pending && (
            <li className="grain relative mt-3 overflow-hidden rounded-3xl bg-linear-to-br from-night to-night-2 p-5 text-white shadow-lift animate-rise">
              <p className="font-display text-lg font-bold">
                {outOfTurns ? "That's the end of the conversation." : `${persona} is wrapping up the conversation.`}
              </p>
              <p className="mt-1 text-sm text-white/70">See how you did and what to try next time.</p>
              <Button variant="inverse" className="mt-4" onClick={getFeedback} disabled={scoring}>
                {scoring ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {scoring ? "Analyzing your conversation…" : "Get my feedback"}
                {!scoring && <ArrowRight className="size-4" aria-hidden />}
              </Button>
            </li>
          )}
        </ol>
      </main>

      {/* Composer */}
      <footer className="relative z-10 border-t border-line bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-3 pt-3 sm:px-5">
          {error && (
            <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              <span>{error.message}</span>
              <span className="flex items-center gap-2">
                {error.retryable && pending && (
                  <Button size="sm" variant="secondary" onClick={retry} disabled={sending || retryIn > 0}>
                    <RotateCcw className="size-3.5" aria-hidden />
                    {retryIn > 0 ? `Retry in ${retryIn}s` : "Retry"}
                  </Button>
                )}
                <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="rounded p-1 hover:bg-danger/10">
                  <X className="size-4" aria-hidden />
                </button>
              </span>
            </div>
          )}
          {!error && pending && !sending && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
              <span>Your last message didn&apos;t get a reply. Your conversation is saved.</span>
              <Button size="sm" variant="secondary" onClick={retry} disabled={retryIn > 0}>
                <RotateCcw className="size-3.5" aria-hidden /> {retryIn > 0 ? `Retry in ${retryIn}s` : "Retry"}
              </Button>
            </div>
          )}
          {stt.error && (
            <div role="status" className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-canvas px-3 py-2 text-sm text-ink-2">
              <span>{voiceErrorMessages[stt.error]}</span>
              <button type="button" onClick={stt.clearError} aria-label="Dismiss" className="rounded p-1 hover:bg-ink/5">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-end gap-2"
          >
            {stt.supported !== false && (
              <button
                type="button"
                onPointerDown={onMicDown}
                onPointerUp={onMicUp}
                onPointerLeave={() => stt.listening && pressStartRef.current && onMicUp()}
                onKeyDown={onMicKey}
                onContextMenu={(e) => e.preventDefault()}
                disabled={composerDisabled || stt.supported === null}
                aria-pressed={stt.listening}
                aria-label={stt.listening ? "Stop recording" : "Start voice input"}
                className={`flex size-12 shrink-0 touch-none select-none items-center justify-center rounded-full transition-all disabled:opacity-40 ${
                  stt.listening ? "bg-accent text-white animate-pulse-ring" : "bg-night text-white hover:scale-105 hover:bg-night-2"
                }`}
              >
                {stt.listening ? <Square className="size-4 fill-current" aria-hidden /> : <Mic className="size-5" aria-hidden />}
              </button>
            )}
            <div className="relative flex-1">
              <label htmlFor="reply" className="sr-only">
                Your reply
              </label>
              <textarea
                id="reply"
                ref={textareaRef}
                rows={1}
                value={stt.listening ? [draft, stt.interim].filter(Boolean).join(" ") : draft}
                readOnly={stt.listening}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                disabled={composerDisabled}
                placeholder={
                  outOfTurns ? "No turns left — get your feedback" : stt.listening ? "Listening…" : stt.supported ? "Speak or type your reply…" : "Type your reply…"
                }
                aria-invalid={overLimit}
                aria-describedby="composer-hint"
                className={`block max-h-40 min-h-12 w-full resize-none rounded-3xl border bg-canvas px-4 py-3 text-[15px] leading-snug placeholder:text-muted/70 focus:bg-surface focus:outline-none focus:ring-4 disabled:opacity-60 ${
                  overLimit ? "border-danger focus:ring-danger/15" : "border-line-strong focus:border-brand focus:ring-brand/15"
                } ${stt.listening ? "text-ink-2" : ""}`}
              />
            </div>
            <button
              type="submit"
              disabled={composerDisabled || !draft.trim() || overLimit || stt.listening}
              aria-label="Send reply"
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand to-[#8b45f3] text-white shadow-glow transition-all hover:scale-105 disabled:opacity-40 disabled:shadow-none"
            >
              {sending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Send className="size-5" aria-hidden />}
            </button>
          </form>

          <div id="composer-hint" className="flex items-center justify-between gap-3 py-2 text-xs text-muted">
            <span aria-live="polite">
              {status}
              {stt.supported && !stt.listening && !composerDisabled && " · Tap the mic, or hold it to talk. Edit before sending."}
              {stt.supported === false && " · Voice input needs Chrome — typing works everywhere."}
              {tts.supported && !tts.hasVoiceForLocale && " · No voice for this language on your device; replies show as text."}
            </span>
            {draft.length > maxChars * 0.8 && (
              <span className={`tabular-nums ${overLimit ? "text-danger" : ""}`}>
                {draft.length}/{maxChars}
              </span>
            )}
          </div>
        </div>
      </footer>

      {endOpen && (
        <EndDialog
          canScore={canScore}
          minTurns={session.minTurnsForScorecard}
          turnsUsed={turnsUsed}
          scoring={scoring}
          onClose={() => setEndOpen(false)}
          onScore={getFeedback}
          onExit={exitWithoutFeedback}
        />
      )}
    </div>
  );
}

function EndDialog(props: {
  canScore: boolean;
  minTurns: number;
  turnsUsed: number;
  scoring: boolean;
  onClose: () => void;
  onScore: () => void;
  onExit: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!props.scoring) props.onClose();
      }}
      aria-labelledby="end-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[28px] border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-night/50 backdrop:backdrop-blur-sm"
    >
      <div className="p-6 sm:p-7">
        <h2 id="end-title" className="text-2xl font-extrabold">
          End this practice?
        </h2>
        {props.canScore ? (
          <p className="mt-2 text-[15px] text-ink-2">
            You&apos;ve replied {props.turnsUsed} {props.turnsUsed === 1 ? "time" : "times"}. We&apos;ll review the conversation and show
            your feedback.
          </p>
        ) : (
          <p className="mt-2 text-[15px] text-ink-2">
            This session is too short for reliable feedback. Reply at least {props.minTurns} times to get a scorecard — you&apos;ve
            replied {props.turnsUsed} {props.turnsUsed === 1 ? "time" : "times"} so far.
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {props.canScore ? (
            <>
              <Button variant="secondary" onClick={props.onClose} disabled={props.scoring}>
                Keep practicing
              </Button>
              <Button onClick={props.onScore} disabled={props.scoring}>
                {props.scoring && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {props.scoring ? "Analyzing…" : "End and get feedback"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={props.onExit}>
                Exit without feedback
              </Button>
              <Button onClick={props.onClose}>Keep practicing</Button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

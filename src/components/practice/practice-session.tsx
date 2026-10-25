"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  Headphones,
  Keyboard,
  Lightbulb,
  Loader2,
  Mic,
  Phone,
  RotateCcw,
  Send,
  Square,
  Target,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiRequestError, trackEvent, type ApiError } from "@/lib/client/api";
import { useSpeechRecognition, voiceErrorMessages, type VoiceErrorKind } from "@/lib/client/use-speech-recognition";
import { useSpeechSynthesis } from "@/lib/client/use-speech-synthesis";
import { uuid } from "@/lib/client/uuid";
import { MOOD_LABELS, type Mood } from "@/lib/roleplay/moods";
import type { SessionView } from "@/lib/sessions/service";

const LANGUAGE_LABELS: Record<string, string> = { en: "English", hi: "Hindi", hinglish: "Hinglish" };
const AUTOPLAY_KEY = "tmp_autoplay";
// A press held longer than this is treated as hold-to-talk; shorter presses toggle.
const HOLD_THRESHOLD_MS = 350;
// Hands-free: how long a pause ends the user's turn, and how long they get to review before it sends.
const SILENCE_MS = 1500;
const NO_SPEECH_MS = 9000;
const AUTO_SEND_SECONDS = 2;

const MOOD_DOT: Record<Mood, string> = {
  frustrated: "bg-danger",
  skeptical: "bg-accent",
  neutral: "bg-muted",
  warming: "bg-brand",
  cooperative: "bg-success",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

type Hint = { tip: string; example: string };

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
  // Before the first reply we ask how they want to practise; resumed sessions skip this.
  const [started, setStarted] = useState(initial.userTurns > 0);
  const [callMode, setCallMode] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [autoSendIn, setAutoSendIn] = useState<number | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintsLeft, setHintsLeft] = useState(initial.hintsLeft);

  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pressStartRef = useRef(0);
  const callModeRef = useRef(callMode);
  callModeRef.current = callMode;

  const persona = session.scenario.personaName;
  const sending = sendingText !== null;
  const turnsUsed = session.userTurns;
  const outOfTurns = turnsUsed >= session.maxTurns;
  const canScore = turnsUsed >= session.minTurnsForScorecard;
  const pending = session.pendingRetry;
  const speechLocale = session.speechLocale ?? ttsLocale;
  const mood = session.clientMood;

  const tts = useSpeechSynthesis(ttsLocale, session.scenario.voice);

  const onVoiceError = useCallback((kind: VoiceErrorKind) => {
    if (kind !== "no-speech") trackEvent("voice_failure", { reason: kind });
    // Fall back to typing when the microphone can't be used at all.
    if (kind === "permission" || kind === "no-mic" || kind === "unsupported" || kind === "language") {
      setCallMode(false);
    }
  }, []);

  const onFinal = useCallback((text: string) => {
    setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text));
    setUsedVoice(true);
    if (callModeRef.current) setAutoSendIn(AUTO_SEND_SECONDS);
    else requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const stt = useSpeechRecognition(speechLocale, onFinal, onVoiceError);
  const voiceAvailable = stt.supported === true && tts.supported === true;

  const listenHandsFree = useCallback(() => {
    if (!callModeRef.current) return;
    stt.start({ autoStopAfterSilenceMs: SILENCE_MS, noSpeechTimeoutMs: NO_SPEECH_MS });
  }, [stt]);

  /** Speaks a client line; in call mode, starts listening as soon as it finishes. */
  const sayAloud = useCallback(
    (id: string, text: string) => {
      if (callModeRef.current) {
        tts.speak(id, text, () => setTimeout(listenHandsFree, 250));
      } else if (autoplay) {
        tts.speak(id, text);
      }
    },
    [tts, autoplay, listenHandsFree],
  );

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
  }, [session.messages.length, sendingText, hint]);

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
  }, [draft, stt.interim, showKeyboard, callMode]);

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
    setHint(null);
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
      const finished = data.session.userTurns >= data.session.maxTurns || data.wantsToEnd;
      if (last?.speaker === "ai") {
        // Don't reopen the mic once the client has wrapped up the call.
        if (finished) {
          if (autoplay || callModeRef.current) tts.speak(last.id, last.text);
        } else {
          sayAloud(last.id, last.text);
        }
      }
    } catch (err) {
      const e = err instanceof ApiRequestError ? err.error : { code: "server_error", message: "Something went wrong.", status: 500 };
      // Find out whether the server saved the message before failing.
      const fresh = await refresh();
      const saved = fresh?.pendingRetry?.clientMessageId === clientMessageId;
      if (!saved && fresh?.messages.some((m) => m.speaker === "user" && m.text === text && m.turn === fresh.userTurns)) {
        // Saved and answered (e.g. response lost on the way back) — nothing to do.
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
    setAutoSendIn(null);
    if (!text || sending || pending || outOfTurns || text.length > maxChars) return;
    if (stt.listening) stt.stop();
    setDraft("");
    void submit(text, uuid(), usedVoice ? "voice" : "text");
  }

  // Hands-free auto-send countdown; any edit cancels it.
  useEffect(() => {
    if (autoSendIn === null) return;
    if (autoSendIn <= 0) {
      send();
      return;
    }
    const t = setTimeout(() => setAutoSendIn((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSendIn]);

  function cancelAutoSend() {
    setAutoSendIn(null);
    setShowKeyboard(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function retry() {
    if (pending) void submit(pending.text, pending.clientMessageId, "text");
  }

  function startCall(voice: boolean) {
    setStarted(true);
    setCallMode(voice);
    callModeRef.current = voice;
    const opening = session.messages[0];
    // This click is the user gesture browsers require before audio can play.
    if (opening?.speaker === "ai" && (voice || autoplay)) sayAloud(opening.id, opening.text);
    if (!voice) requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function toggleCallMode() {
    const next = !callMode;
    setCallMode(next);
    callModeRef.current = next;
    setAutoSendIn(null);
    if (!next) {
      if (stt.listening) stt.stop();
      return;
    }
    setShowKeyboard(false);
    if (!sending && !pending && !outOfTurns && !tts.speakingId) listenHandsFree();
  }

  async function getHint() {
    if (hintLoading || hintsLeft <= 0) return;
    setHintLoading(true);
    setError(null);
    try {
      const { data } = await api<{ hint: Hint; hintsLeft: number }>(`/api/sessions/${session.id}/hint`, { method: "POST" });
      setHint(data.hint);
      setHintsLeft(data.hintsLeft);
    } catch (err) {
      const e = err instanceof ApiRequestError ? err.error : { code: "server_error", message: "Couldn't get a hint.", status: 500 };
      setError({ ...e, retryable: false });
    } finally {
      setHintLoading(false);
    }
  }

  async function getFeedback() {
    if (scoring) return;
    setScoring(true);
    setError(null);
    tts.stop();
    if (stt.listening) stt.stop();
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

  // Mic: in call mode a tap toggles listening (and interrupts the client);
  // otherwise hold to talk, or tap to start and tap again to stop.
  function onMicDown(e: React.PointerEvent) {
    e.preventDefault();
    setAutoSendIn(null);
    if (stt.listening) {
      stt.stop();
      pressStartRef.current = 0;
      return;
    }
    tts.stop();
    if (callMode) {
      listenHandsFree();
      return;
    }
    pressStartRef.current = Date.now();
    stt.start();
  }
  function onMicUp() {
    if (!callMode && pressStartRef.current && Date.now() - pressStartRef.current > HOLD_THRESHOLD_MS) stt.stop();
    pressStartRef.current = 0;
  }
  function onMicKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setAutoSendIn(null);
      if (stt.listening) stt.stop();
      else {
        tts.stop();
        if (callMode) listenHandsFree();
        else stt.start();
      }
    }
  }

  const clientSpeaking = tts.speakingId !== null;
  const status = useMemo(() => {
    if (scoring) return "Preparing your feedback…";
    if (sending) return `${persona} is thinking…`;
    if (pending) return "Last message wasn't delivered";
    if (outOfTurns) return "All turns used";
    if (autoSendIn !== null) return `Sending in ${autoSendIn}…`;
    if (stt.listening) return callMode ? "Listening — pause when you're done" : "Listening…";
    if (clientSpeaking) return `${persona} is speaking — tap the mic to interrupt`;
    if (callMode) return "Tap the mic to talk";
    return "Your turn";
  }, [scoring, sending, pending, outOfTurns, autoSendIn, stt.listening, clientSpeaking, callMode, persona]);

  const composerDisabled = sending || !!pending || outOfTurns || scoring;
  const overLimit = draft.length > maxChars;
  const liveText = stt.listening ? [draft, stt.interim].filter(Boolean).join(" ") : draft;

  const micButton = (size: "md" | "lg") => (
    <button
      type="button"
      onPointerDown={onMicDown}
      onPointerUp={onMicUp}
      onPointerLeave={() => stt.listening && pressStartRef.current && onMicUp()}
      onKeyDown={onMicKey}
      onContextMenu={(e) => e.preventDefault()}
      disabled={composerDisabled || stt.supported === null}
      aria-pressed={stt.listening}
      aria-label={stt.listening ? "Stop recording" : clientSpeaking ? "Interrupt and talk" : "Start voice input"}
      className={`flex shrink-0 touch-none select-none items-center justify-center rounded-full transition-all disabled:opacity-40 ${
        size === "lg" ? "size-18 shadow-lift" : "size-12"
      } ${stt.listening ? "bg-accent text-white animate-pulse-ring" : "bg-night text-white hover:scale-105 hover:bg-night-2"}`}
    >
      {stt.listening ? (
        <Square className={`${size === "lg" ? "size-5" : "size-4"} fill-current`} aria-hidden />
      ) : (
        <Mic className={size === "lg" ? "size-6" : "size-5"} aria-hidden />
      )}
    </button>
  );

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-canvas">
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
            className={`relative flex size-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-accent to-[#d63a4c] font-display text-xs font-bold text-white transition-shadow ${
              clientSpeaking ? "ring-2 ring-accent/60 ring-offset-2 ring-offset-surface" : ""
            }`}
            aria-hidden
          >
            {initials(persona)}
            <span
              className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-surface ${sending ? "animate-pulse bg-accent" : "bg-lime"}`}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[15px] font-bold leading-tight">{persona}</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted" aria-live="polite">
              <span className={`size-1.5 shrink-0 rounded-full transition-colors ${MOOD_DOT[mood]}`} aria-hidden />
              <span>
                <span className="sr-only">Client mood: </span>
                {MOOD_LABELS[mood]}
              </span>
              <span aria-hidden>·</span>
              <span className="truncate">{session.scenario.title}</span>
            </p>
          </div>
          <span className="hidden sm:block">
            <Badge>{LANGUAGE_LABELS[session.language] ?? session.language}</Badge>
          </span>
          {voiceAvailable && started && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleCallMode}
              aria-pressed={callMode}
              aria-label={callMode ? "Turn off hands-free mode" : "Turn on hands-free mode"}
              title={callMode ? "Hands-free on" : "Hands-free off"}
              className={callMode ? "bg-brand-soft text-brand-ink hover:bg-brand/15" : ""}
            >
              <Headphones className="size-4" aria-hidden />
            </Button>
          )}
          {tts.supported && !callMode && (
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
                <div
                  className={`rounded-3xl rounded-bl-md border bg-surface px-4 py-3 shadow-card transition-colors ${
                    tts.speakingId === m.id ? "border-accent/50" : "border-line"
                  }`}
                >
                  <p className="sr-only">{persona} said:</p>
                  <p className="text-[15px] leading-relaxed">{m.text}</p>
                </div>
                {tts.supported && started && (
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

          {hint && (
            <li className="rounded-3xl border border-ink/10 bg-lime-soft p-5 shadow-card animate-rise" aria-label="Coach hint">
              <div className="flex items-start justify-between gap-3">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-lime px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-ink">
                  <Lightbulb className="size-3.5" aria-hidden /> Coach
                </p>
                <button type="button" onClick={() => setHint(null)} aria-label="Dismiss hint" className="rounded-full p-1 text-ink-2 hover:bg-ink/5">
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              <p className="mt-3 text-[15px] text-ink">{hint.tip}</p>
              <p className="mt-2 font-serif text-lg italic leading-snug text-ink-2">“{hint.example}”</p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-3"
                onClick={() => {
                  setDraft(hint.example);
                  setHint(null);
                  setShowKeyboard(true);
                  requestAnimationFrame(() => textareaRef.current?.focus());
                }}
              >
                Use as a starting point
              </Button>
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

          {!started ? (
            <div className="pb-3 text-center">
              <p className="font-display text-lg font-bold">How do you want to practice?</p>
              <p className="mt-1 text-xs text-muted">
                {voiceAvailable
                  ? "A voice call feels closest to the real thing. You can switch at any time."
                  : "Voice calls need a browser with speech support, such as Chrome. Typing works everywhere."}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
                {voiceAvailable && (
                  <Button size="lg" onClick={() => startCall(true)}>
                    <Phone className="size-4" aria-hidden /> Start voice call
                  </Button>
                )}
                <Button size="lg" variant={voiceAvailable ? "secondary" : "primary"} onClick={() => startCall(false)}>
                  <Keyboard className="size-4" aria-hidden /> {voiceAvailable ? "Type instead" : "Start typing"}
                </Button>
              </div>
            </div>
          ) : callMode && !showKeyboard ? (
            /* Hands-free call view */
            <div className="flex flex-col items-center pb-2">
              <div
                className={`mb-3 min-h-12 w-full rounded-3xl px-4 py-3 text-center text-[15px] leading-snug transition-colors ${
                  liveText ? "bg-canvas text-ink ring-1 ring-line" : "text-muted"
                }`}
                aria-live="polite"
              >
                {liveText || (stt.listening ? "Listening…" : "Your words will appear here")}
              </div>
              <div className="flex w-full items-center justify-between">
                <Button variant="ghost" size="md" onClick={() => setShowKeyboard(true)} aria-label="Show keyboard">
                  <Keyboard className="size-5" aria-hidden />
                </Button>
                {micButton("lg")}
                {autoSendIn !== null ? (
                  <Button variant="ghost" size="md" onClick={cancelAutoSend}>
                    Edit
                  </Button>
                ) : (
                  <button
                    type="button"
                    onClick={send}
                    disabled={composerDisabled || !draft.trim() || stt.listening}
                    aria-label="Send reply"
                    className="flex size-11 items-center justify-center rounded-full bg-linear-to-br from-brand to-[#8b45f3] text-white shadow-glow transition-all hover:scale-105 disabled:opacity-0"
                  >
                    <Send className="size-4" aria-hidden />
                  </button>
                )}
              </div>
              {autoSendIn !== null && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted">Sending in {autoSendIn}…</span>
                  <Button size="sm" variant="secondary" onClick={send}>
                    Send now
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-end gap-2"
            >
              {stt.supported !== false && micButton("md")}
              <div className="relative flex-1">
                <label htmlFor="reply" className="sr-only">
                  Your reply
                </label>
                <textarea
                  id="reply"
                  ref={textareaRef}
                  rows={1}
                  value={liveText}
                  readOnly={stt.listening}
                  onChange={(e) => {
                    setAutoSendIn(null);
                    setDraft(e.target.value);
                  }}
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
          )}

          {started && (
            <div id="composer-hint" className="flex items-center justify-between gap-3 py-2 text-xs text-muted">
              <span aria-live="polite" className="min-w-0">
                {status}
                {!callMode && stt.supported && !stt.listening && !composerDisabled && !clientSpeaking && " · Tap or hold the mic. Edit before sending."}
                {stt.supported === false && " · Voice input needs Chrome — typing works everywhere."}
                {tts.supported && !tts.hasVoiceForLocale && " · No voice for this language on your device."}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {draft.length > maxChars * 0.8 && (
                  <span className={`tabular-nums ${overLimit ? "text-danger" : ""}`}>
                    {draft.length}/{maxChars}
                  </span>
                )}
                {callMode && showKeyboard && (
                  <button type="button" onClick={() => setShowKeyboard(false)} className="font-medium text-brand hover:underline">
                    Back to voice
                  </button>
                )}
                {!outOfTurns && (
                  <button
                    type="button"
                    onClick={getHint}
                    disabled={hintLoading || hintsLeft <= 0 || composerDisabled}
                    className="inline-flex items-center gap-1 rounded-full bg-lime-soft px-2.5 py-1 font-semibold text-ink ring-1 ring-ink/10 transition-colors hover:bg-lime disabled:bg-transparent disabled:font-medium disabled:text-muted disabled:ring-0"
                  >
                    {hintLoading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Lightbulb className="size-3.5" aria-hidden />}
                    Hint ({hintsLeft})
                  </button>
                )}
              </span>
            </div>
          )}
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

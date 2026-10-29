"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  Headphones,
  Heart,
  Keyboard,
  Lightbulb,
  Loader2,
  Mic,
  Phone,
  PhoneOff,
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
import { usePipecatVoice } from "@/lib/client/use-pipecat-voice";
import { uuid } from "@/lib/client/uuid";
import { PersonaAvatar } from "@/components/practice/persona-avatar";
import { playConnected, playHangup, playRingback, playRingtone, unlockCallSounds } from "@/lib/client/call-sounds";
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

const MOOD_EMOJI: Record<Mood, string> = {
  frustrated: "😤",
  skeptical: "🤨",
  neutral: "😐",
  warming: "🙂",
  cooperative: "😄",
};

const END_TITLES: Record<NonNullable<SessionView["endReason"]>, (persona: string) => string> = {
  client_ended: (p) => `${p} wrapped up the call.`,
  patience_exhausted: (p) => `${p} ran out of patience and ended the call.`,
  turn_limit: () => "That's the end of the conversation.",
};
// Sounds the client makes while thinking of a reply on a voice call, by mood. Real people fill
// the gap, and it covers the moment the reply takes to generate. Never when they're annoyed.
const THINKING_SOUNDS: Record<Mood, string[]> = {
  frustrated: [],
  skeptical: ["Hmm..."],
  neutral: ["Hmm...", "Okay..."],
  warming: ["Okay...", "Right...", "Mm, okay..."],
  cooperative: ["Right...", "Okay...", "Mm, okay..."],
};
// How long the outgoing call rings before the client picks up (about one and a half rings).
const MIN_RING_MS = 4200;
// For incoming calls, how long after going on-call the client rings.
const INCOMING_DELAY_MS = 1200;

type CallPhase = "idle" | "waiting" | "dialing" | "incoming" | "connecting" | "live" | "ended";

// After the call ends, give the learner a moment to read the last line before feedback opens.
const AUTO_FEEDBACK_SECONDS = 4;

const MOOD_DOT: Record<Mood, string> = {
  frustrated: "bg-danger",
  skeptical: "bg-accent",
  neutral: "bg-muted",
  warming: "bg-brand",
  cooperative: "bg-success",
};

type Hint = { tip: string; example: string };

export function PracticeSession({ initial, ttsLocale, maxChars }: { initial: SessionView; ttsLocale: string; maxChars: number }) {
  const router = useRouter();
  const [session, setSession] = useState(initial);
  const [draft, setDraft] = useState("");
  const [usedVoice, setUsedVoice] = useState(false);
  const [sendingText, setSendingText] = useState<string | null>(null);
  const [error, setError] = useState<(ApiError & { retryable: boolean }) | null>(null);
  const [retryIn, setRetryIn] = useState(0);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [feedbackIn, setFeedbackIn] = useState<number | null>(null);
  const [callPhase, setCallPhase] = useState<CallPhase>("idle");
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [callSeconds, setCallSeconds] = useState<number | null>(null);
  const stopRingRef = useRef<(() => void) | null>(null);
  // Bumped when a call is cancelled, so a ring timer or connection still in flight is ignored.
  const callAttemptRef = useRef(0);
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
  // The conversation is over: the client ended it, ran out of patience, or the turns ran out.
  const concluded = session.endReason !== null || outOfTurns;
  const canScore = turnsUsed >= (session.endReason ? 1 : session.minTurnsForScorecard);
  const pending = session.pendingRetry;
  const speechLocale = session.speechLocale ?? ttsLocale;
  const mood = session.clientMood;

  const tts = useSpeechSynthesis(ttsLocale, session.scenario.voice);
  // The voice agent only listens and speaks; each turn goes through the same API as typed
  // replies, so mood, patience, the end of the call and feedback work the same way.
  const pipecat = usePipecatVoice(
    {
      endpoint: process.env.NEXT_PUBLIC_PIPECAT_URL ?? "http://127.0.0.1:7860/api/offer",
      language: session.language,
      gender: session.scenario.voice?.gender,
      voice: session.scenario.voice?.kokoro,
    },
    (text, speechMs) => {
      if (!text) {
        setVoiceNotice("Didn't catch that. Hold the button while you speak, then let go.");
        return;
      }
      setVoiceNotice(null);
      const sounds = THINKING_SOUNDS[session.clientMood];
      if (sounds.length && Math.random() < 0.5) pipecat.speak(sounds[Math.floor(Math.random() * sounds.length)]);
      void submit(text, uuid(), "voice", speechMs);
    },
    () => setVoiceNotice("That took too long to catch. Hold the button and say it again."),
  );

  // Hold Space to talk during a voice call, like a walkie-talkie.
  const pttActive = callMode && pipecat.connected && !showKeyboard && !concluded;
  useEffect(() => {
    if (!pttActive) return;
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]") !== null;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e)) return;
      e.preventDefault();
      if (!e.repeat) pipecat.press();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e)) return;
      e.preventDefault();
      pipecat.release();
    };
    // Letting go while the tab is in the background still ends the turn.
    const blur = () => pipecat.release();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [pttActive, pipecat.press, pipecat.release]);

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
  const voiceAvailable = pipecat.available === true;

  const listenHandsFree = useCallback(() => {
    if (!callModeRef.current) return;
    // The local voice agent listens continuously, so the browser recogniser stays off.
    if (pipecat.connectedRef.current) return;
    stt.start({ autoStopAfterSilenceMs: SILENCE_MS, noSpeechTimeoutMs: NO_SPEECH_MS });
  }, [pipecat.connectedRef, stt]);

  /** Speaks a client line; in call mode, starts listening as soon as it finishes. */
  const sayAloud = useCallback(
    (id: string, text: string) => {
      if (pipecat.connectedRef.current) {
        pipecat.speak(text);
      } else if (callModeRef.current) {
        tts.speak(id, text, () => setTimeout(listenHandsFree, 250));
      } else if (autoplay) {
        tts.speak(id, text);
      }
    },
    [tts, autoplay, listenHandsFree, pipecat],
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

  async function submit(text: string, clientMessageId: string, inputMode: "voice" | "text", speechMs?: number) {
    if (sending) return;
    tts.stop();
    setError(null);
    setHint(null);
    setSendingText(text);
    try {
      const { data } = await api<{ session: SessionView; wantsToEnd: boolean }>(`/api/sessions/${session.id}/messages`, {
        method: "POST",
        json: { text, clientMessageId, inputMode, speechMs },
      });
      setSession(data.session);
      setUsedVoice(false);
      const last = data.session.messages[data.session.messages.length - 1];
      if (last?.speaker === "ai") {
        if (data.wantsToEnd && !pipecat.connectedRef.current) {
          // Don't reopen the browser mic once the client has ended the call.
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
    if (!text || sending || pending || concluded || text.length > maxChars) return;
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

  async function startCall(voice: boolean) {
    setStarted(true);
    setCallMode(voice);
    callModeRef.current = voice;
    if (voice) {
      placeCall();
      return;
    }
    const opening = session.messages[0];
    // This click is the user gesture browsers require before audio can play.
    if (opening?.speaker === "ai" && autoplay) sayAloud(opening.id, opening.text);
    if (!voice) requestAnimationFrame(() => textareaRef.current?.focus());
  }

  /** Starts a voice call: ring out, or wait for the client to ring, depending on the scenario. */
  function placeCall() {
    // This click is the gesture that lets the call sounds play.
    unlockCallSounds();
    tts.stop();
    if (stt.listening) stt.stop();
    const attempt = ++callAttemptRef.current;
    if (session.scenario.callDirection === "incoming") {
      setCallPhase("waiting");
      setTimeout(() => {
        if (attempt !== callAttemptRef.current) return;
        setCallPhase("incoming");
        stopRingRef.current = playRingtone();
      }, INCOMING_DELAY_MS);
      return;
    }
    setCallPhase("dialing");
    stopRingRef.current = playRingback();
    // Connect while it rings, so the client picks up as soon as the ring ends.
    const ring = new Promise((r) => setTimeout(r, MIN_RING_MS));
    void Promise.all([connectVoiceAgent(), ring]).then(([ok]) => {
      if (attempt === callAttemptRef.current) goLive(ok);
    });
  }

  async function answerCall() {
    const attempt = callAttemptRef.current;
    stopRingRef.current?.();
    setCallPhase("connecting");
    const ok = await connectVoiceAgent();
    if (attempt === callAttemptRef.current) goLive(ok);
  }

  function declineCall() {
    callAttemptRef.current++;
    stopRingRef.current?.();
    pipecat.disconnect();
    setCallPhase("idle");
    setCallMode(false);
    callModeRef.current = false;
    setStarted(initial.userTurns > 0);
  }

  function goLive(ok: boolean) {
    stopRingRef.current?.();
    stopRingRef.current = null;
    if (!ok) {
      setCallPhase("idle");
      setError({ code: "voice_unavailable", message: "Couldn't reach the voice agent. Make sure it's running, then try again.", status: 503, retryable: false });
      return;
    }
    playConnected();
    setCallPhase("live");
    setCallStartedAt(Date.now());
    // The client opens with their latest line (the opening line on a fresh call).
    const last = session.messages.at(-1);
    if (last?.speaker === "ai") pipecat.speak(last.text);
  }

  /** Ends the voice call with the hang-up tone. */
  function hangUp() {
    stopRingRef.current?.();
    if (callPhase === "live" || pipecat.connectedRef.current) void playHangup();
    pipecat.disconnect();
    if (callStartedAt) setCallSeconds(Math.round((Date.now() - callStartedAt) / 1000));
    setCallPhase((p) => (p === "live" ? "ended" : "idle"));
  }

  async function connectVoiceAgent() {
    tts.stop();
    if (stt.listening) stt.stop();
    try {
      await pipecat.connect();
      return true;
    } catch {
      setCallMode(false);
      callModeRef.current = false;
      return false;
    }
  }

  function toggleCallMode() {
    const next = !callMode;
    setCallMode(next);
    callModeRef.current = next;
    setAutoSendIn(null);
    if (!next) {
      hangUp();
      if (stt.listening) stt.stop();
      return;
    }
    setShowKeyboard(false);
    if (!sending && !pending && !concluded) placeCall();
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
    setFeedbackIn(null);
    tts.stop();
    if (stt.listening) stt.stop();
    if (pipecat.connectedRef.current) hangUp();
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
    if (pipecat.connectedRef.current) hangUp();
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
    if (callMode) return;
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

  const clientSpeaking = pipecat.connected ? pipecat.speaking : tts.speakingId !== null;
  const status = useMemo(() => {
    if (scoring) return "Preparing your feedback…";
    if (sending) return `${persona} is thinking…`;
    if (pending) return "Last message wasn't delivered";
    if (concluded) return "The call has ended";
    if (autoSendIn !== null) return `Sending in ${autoSendIn}…`;
    if (callMode && pipecat.error) return pipecat.error;
    if (callMode && pipecat.connected) {
      if (pipecat.holding) return "Listening — release to send";
      if (pipecat.transcribing) return "Catching your words…";
      if (clientSpeaking) return `${persona} is speaking — hold to interrupt`;
      return "Hold the mic or Space to talk";
    }
    if (callMode && pipecat.connecting) return `Calling ${persona}…`;
    if (stt.listening) return callMode ? "Listening — pause when you're done" : "Listening…";
    if (clientSpeaking) return `${persona} is speaking — tap the mic to interrupt`;
    if (callMode) return "Tap the mic to talk";
    return "Your turn";
  }, [scoring, sending, pending, concluded, autoSendIn, stt.listening, clientSpeaking, callMode, persona, pipecat.error, pipecat.connected, pipecat.connecting, pipecat.holding, pipecat.transcribing]);

  const composerDisabled = sending || !!pending || concluded || scoring;

  // Once the call has ended and the last line has been heard, open the feedback automatically.
  const finalLineDone = !sending && !clientSpeaking && !pipecat.speaking;
  useEffect(() => {
    if (!concluded || !canScore || scoring) return;
    // A pause between sentences can look like the end; restart the countdown if speech resumes.
    setFeedbackIn(finalLineDone ? AUTO_FEEDBACK_SECONDS : null);
  }, [concluded, canScore, finalLineDone, scoring]);
  // The client has said goodbye: hang up the call.
  useEffect(() => {
    if (concluded && finalLineDone && callPhase === "live") hangUp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concluded, finalLineDone, callPhase]);
  useEffect(() => () => stopRingRef.current?.(), []);
  useEffect(() => {
    if (feedbackIn === null) return;
    if (feedbackIn <= 0) {
      void getFeedback();
      return;
    }
    const t = setTimeout(() => setFeedbackIn((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackIn]);
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

  /** The client's face; it talks in time with the voice agent's audio when on a call. */
  const avatar = (size: number, live: boolean) => (
    <PersonaAvatar
      seed={session.scenario.id}
      name={persona}
      gender={session.scenario.voice.gender}
      mood={mood}
      size={size}
      speaking={live && clientSpeaking}
      levelRef={live && pipecat.connected ? pipecat.botLevelRef : undefined}
      className="rounded-full"
    />
  );

  const talkButton = (
    <button
      type="button"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        pipecat.press();
      }}
      onPointerUp={pipecat.release}
      onPointerCancel={pipecat.release}
      onLostPointerCapture={pipecat.release}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (!e.repeat) pipecat.press();
      }}
      onKeyUp={(e) => e.key === "Enter" && pipecat.release()}
      onContextMenu={(e) => e.preventDefault()}
      disabled={!pipecat.connected || concluded || scoring || sending || pipecat.transcribing}
      aria-pressed={pipecat.holding}
      aria-label={pipecat.holding ? "Release to send" : "Hold to talk"}
      className={`relative flex size-18 shrink-0 touch-none select-none items-center justify-center rounded-full text-white shadow-lift transition-all disabled:opacity-40 ${
        pipecat.holding ? "scale-110 bg-accent animate-pulse-ring" : "bg-night hover:scale-105 hover:bg-night-2"
      }`}
    >
      {pipecat.holding && <MicLevelRing levelRef={pipecat.micLevelRef} />}
      {pipecat.connecting ? <Loader2 className="relative size-6 animate-spin" aria-hidden /> : <Mic className="relative size-6" aria-hidden />}
    </button>
  );

  return (
    <div className="relative flex h-dvh overflow-hidden bg-canvas">
      <div className="bg-dots pointer-events-none absolute inset-0" aria-hidden />
      <div className="pointer-events-none absolute -left-40 top-1/3 size-96 rounded-full bg-brand/10 blur-[100px]" aria-hidden />
      <div className="pointer-events-none absolute -right-40 bottom-24 size-96 rounded-full bg-accent/10 blur-[100px]" aria-hidden />
      <PersonaPanel
        session={session}
        avatar={avatar(136, true)}
        onCall={pipecat.connected}
        callStartedAt={callStartedAt}
        speaking={clientSpeaking}
        turnsUsed={turnsUsed}
        concluded={concluded}
        hintsLeft={hintsLeft}
        hintLoading={hintLoading}
        hintDisabled={hintLoading || hintsLeft <= 0 || composerDisabled}
        onHint={getHint}
      />
      <div className="relative flex min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="relative z-10 border-b border-line bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-2.5 sm:px-5">
          <Link href="/practice" className="hidden rounded-full p-1.5 text-muted transition-colors hover:bg-ink/5 hover:text-ink sm:block lg:hidden" aria-label="Back to scenarios">
            <X className="size-5" aria-hidden />
          </Link>
          <span
            className={`relative shrink-0 rounded-full transition-shadow lg:hidden ${
              clientSpeaking ? "ring-2 ring-accent/60 ring-offset-2 ring-offset-surface" : ""
            }`}
          >
            {avatar(40, true)}
            <span
              className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-surface ${sending ? "animate-pulse bg-accent" : "bg-lime"}`}
              aria-hidden
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate font-display text-[15px] font-bold leading-tight">
              <span className="lg:hidden">{persona}</span>
              <span className="hidden lg:inline">{session.scenario.title}</span>
              {pipecat.connected && <OnCallPill startedAt={callStartedAt} />}
            </p>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted" aria-live="polite">
              <span className={`size-1.5 shrink-0 rounded-full transition-colors ${MOOD_DOT[mood]}`} aria-hidden />
              <span>
                <span className="sr-only">Client mood: </span>
                {MOOD_LABELS[mood]}
              </span>
              <span aria-hidden>·</span>
              <span
                className={`inline-flex items-center gap-0.5 font-semibold tabular-nums lg:hidden ${
                  session.patience <= Math.max(1, Math.floor(session.maxPatience / 3)) ? "text-danger" : "text-accent-ink"
                }`}
                aria-label={`Patience ${session.patience} of ${session.maxPatience}`}
              >
                <Heart className="size-3 fill-current" aria-hidden />
                {session.patience}/{session.maxPatience}
              </span>
              <span className="hidden truncate lg:inline">{persona}</span>
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

        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-3 pb-2 sm:px-5 lg:hidden">
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
        <div className="mx-auto flex max-w-3xl gap-1 px-3 pb-2.5 sm:px-5 lg:hidden" aria-hidden>
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
          /* The side panel shows the brief on large screens. */
          <div id="brief" className="mx-3 mb-3 max-w-3xl space-y-2 rounded-2xl bg-canvas px-4 py-3 text-sm text-ink-2 ring-1 ring-line animate-rise sm:mx-5 lg:hidden">
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
              <li key={m.id} className="flex max-w-[92%] items-end gap-2.5 animate-rise sm:max-w-[80%]">
                <PersonaAvatar
                  seed={session.scenario.id}
                  name={persona}
                  gender={session.scenario.voice.gender}
                  mood={m.mood ?? mood}
                  size={34}
                  className="mb-0.5 rounded-full ring-2 ring-surface"
                />
                <div
                  className={`rounded-3xl rounded-bl-md border bg-surface px-4 py-3 shadow-card transition-colors ${
                    tts.speakingId === m.id ? "border-accent/50" : "border-line"
                  }`}
                >
                  <p className="sr-only">{persona} said:</p>
                  <p className="text-[15px] leading-relaxed">{m.text}</p>
                </div>
                {tts.supported && started && !callMode && (
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

          {pipecat.transcribing && (
            <li className="ml-auto inline-flex gap-1 rounded-3xl rounded-br-md bg-linear-to-br from-brand to-[#8b45f3] px-4 py-3.5 opacity-70 animate-rise" aria-label="Transcribing">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-2 animate-bounce rounded-full bg-white/80" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </li>
          )}
          {sendingText !== null && !pending && (
            <li className="ml-auto max-w-[88%] rounded-3xl rounded-br-md bg-linear-to-br from-brand to-[#8b45f3] px-4 py-3 text-white opacity-80 animate-rise sm:max-w-[78%]">
              <p className="text-[15px] leading-relaxed">{sendingText}</p>
            </li>
          )}
          {sending && (
            <li className="flex items-end gap-2.5 text-sm text-muted" aria-label={`${persona} is replying`}>
              <PersonaAvatar seed={session.scenario.id} name={persona} gender={session.scenario.voice.gender} mood={mood} size={34} className="mb-0.5 rounded-full ring-2 ring-surface" />
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

          {concluded && !sending && !pending && (
            <li className="grain relative mt-3 overflow-hidden rounded-3xl bg-linear-to-br from-night to-night-2 p-5 text-white shadow-lift animate-rise">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/60">
                <PhoneOff className="size-3.5" aria-hidden /> Call ended{callSeconds !== null && ` · ${formatClock(callSeconds)}`}
              </p>
              <p className="mt-1 font-display text-lg font-bold">{END_TITLES[session.endReason ?? "turn_limit"](persona)}</p>
              <p className="mt-1 text-sm text-white/70" aria-live="polite">
                {scoring
                  ? "Analyzing your conversation…"
                  : feedbackIn !== null
                    ? `Opening your feedback in ${feedbackIn}…`
                    : canScore
                      ? "See how you did and what to try next time."
                      : "Reply at least once to get feedback."}
              </p>
              {canScore && (
                <Button variant="inverse" className="mt-4" onClick={getFeedback} disabled={scoring}>
                  {scoring ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  {scoring ? "Analyzing…" : "Get my feedback now"}
                  {!scoring && <ArrowRight className="size-4" aria-hidden />}
                </Button>
              )}
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
                    <Phone className="size-4" aria-hidden />
                    {session.scenario.callDirection === "incoming" ? `Take ${persona.split(" ")[0]}'s call` : `Call ${persona.split(" ")[0]}`}
                  </Button>
                )}
                <Button size="lg" variant={voiceAvailable ? "secondary" : "primary"} onClick={() => startCall(false)}>
                  <Keyboard className="size-4" aria-hidden /> {voiceAvailable ? "Type instead" : "Start typing"}
                </Button>
              </div>
            </div>
          ) : callMode && !showKeyboard ? (
            /* Voice call view */
            <div className="flex flex-col items-center pb-2">
              <div className="mb-3 flex w-full items-center gap-3 lg:hidden">
                <span className={`rounded-full transition-shadow ${clientSpeaking ? "ring-4 ring-accent/30" : ""}`}>{avatar(64, true)}</span>
                <div className="min-w-0">
                  <p className="font-display text-base font-bold">{persona}</p>
                  <p className="text-xs text-muted">{pipecat.connected ? (clientSpeaking ? "Speaking…" : "On the call") : pipecat.connecting ? "Connecting…" : "Voice"}</p>
                </div>
              </div>
              <div
                className={`mb-3 min-h-12 w-full rounded-3xl px-4 py-3 text-center text-[15px] leading-snug transition-colors ${
                  liveText ? "bg-canvas text-ink ring-1 ring-line" : "text-muted"
                }`}
                aria-live="polite"
              >
                {pipecat.connected || pipecat.connecting
                  ? concluded
                    ? "The call has ended"
                    : pipecat.holding
                      ? "Listening… release to send"
                      : pipecat.transcribing
                        ? "Catching your words…"
                        : sending
                          ? `${persona} is thinking…`
                          : pipecat.speaking
                            ? `${persona} is speaking — hold to interrupt`
                            : pipecat.connecting
                              ? `Calling ${persona}…`
                              : voiceNotice ?? "Hold the mic (or Space) while you talk, let go to send"
                  : liveText || (stt.listening ? "Listening…" : "Your words will appear here")}
              </div>
              <div className="flex w-full items-center justify-between">
                <Button variant="ghost" size="md" onClick={() => setShowKeyboard(true)} aria-label="Show keyboard">
                  <Keyboard className="size-5" aria-hidden />
                </Button>
                {pipecat.connected || pipecat.connecting ? talkButton : micButton("lg")}
                {pipecat.connected || pipecat.connecting ? (
                  <span className="size-11" aria-hidden />
                ) : autoSendIn !== null ? (
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
                    concluded ? "The call has ended" : stt.listening ? "Listening…" : stt.supported ? "Speak or type your reply…" : "Type your reply…"
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
                {!concluded && (
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
      </div>

      {callPhase !== "idle" && callPhase !== "live" && callPhase !== "ended" && (
        <CallScreen
          phase={callPhase}
          name={persona}
          role={session.scenario.personaRole}
          avatar={avatar(152, false)}
          onAnswer={answerCall}
          onDecline={declineCall}
        />
      )}

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

const MOOD_CHIP: Record<Mood, string> = {
  frustrated: "bg-danger-soft text-danger",
  skeptical: "bg-accent-soft text-accent-ink",
  neutral: "bg-ink/[0.05] text-ink-2",
  warming: "bg-brand-soft text-brand-ink",
  cooperative: "bg-success-soft text-success",
};

function formatClock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function OnCallPill({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-success px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-card">
      <span className="size-1.5 animate-pulse rounded-full bg-lime" aria-hidden /> On call
      {startedAt && <span className="tabular-nums">{formatClock(Math.max(0, Math.round((now - startedAt) / 1000)))}</span>}
    </span>
  );
}

/** A ring around the talk button that swells with the learner's voice, so they can see they're heard. */
function MicLevelRing({ levelRef }: { levelRef: RefObject<number> }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let frame = 0;
    let level = 0;
    const tick = () => {
      level += ((levelRef.current ?? 0) - level) * 0.4;
      if (ref.current) {
        ref.current.style.transform = `scale(${1 + level * 0.55})`;
        ref.current.style.opacity = String(0.25 + level * 0.6);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [levelRef]);
  return <span ref={ref} className="absolute inset-0 rounded-full bg-accent" aria-hidden />;
}

/** Full-screen phone UI while the call rings or connects. */
function CallScreen(props: {
  phase: Exclude<CallPhase, "idle" | "live" | "ended">;
  name: string;
  role: string;
  avatar: React.ReactNode;
  onAnswer: () => void;
  onDecline: () => void;
}) {
  const status = {
    waiting: "On standby…",
    dialing: "Calling…",
    incoming: "Incoming call",
    connecting: "Connecting…",
  }[props.phase];
  const ringing = props.phase === "dialing" || props.phase === "incoming";
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-between overflow-hidden bg-linear-to-b from-night to-night-2 px-6 py-16 text-white animate-rise"
      role="dialog"
      aria-modal="true"
      aria-label={`${status} ${props.name}`}
    >
      {/* .grain sets position: relative, so the texture lives on its own layer */}
      <div className="grain pointer-events-none absolute! inset-0" aria-hidden />
      <div className="bg-dots-light pointer-events-none absolute inset-0" aria-hidden />
      <div className="pointer-events-none absolute -top-32 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-brand/40 blur-[110px]" aria-hidden />
      <div className="relative text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60" aria-live="polite">
          {status}
        </p>
        <h2 className="mt-3 font-display text-4xl font-extrabold">{props.name}</h2>
        <p className="mt-1 text-white/60">{props.role}</p>
      </div>

      <div className="relative">
        {ringing && (
          <>
            <span className="absolute inset-0 rounded-full bg-white/20 animate-pulse-ring" aria-hidden />
            <span className="absolute inset-0 rounded-full bg-white/10 animate-pulse-ring [animation-delay:600ms]" aria-hidden />
          </>
        )}
        <span className="relative block rounded-full ring-8 ring-white/10">{props.avatar}</span>
      </div>

      <div className="relative flex items-center gap-16">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={props.onDecline}
            className="flex size-16 items-center justify-center rounded-full bg-danger shadow-lift transition-transform hover:scale-105"
            aria-label={props.phase === "incoming" ? "Decline" : "Cancel call"}
          >
            <PhoneOff className="size-7" aria-hidden />
          </button>
          <span className="text-sm text-white/70">{props.phase === "incoming" ? "Decline" : "Cancel"}</span>
        </div>
        {props.phase === "incoming" && (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={props.onAnswer}
              className="flex size-16 animate-bounce items-center justify-center rounded-full bg-success shadow-lift transition-transform hover:scale-105"
              aria-label="Answer"
              autoFocus
            >
              <Phone className="size-7" aria-hidden />
            </button>
            <span className="text-sm text-white/70">Answer</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** The client's remaining patience as a row of hearts. */
function PatienceHearts({ patience, max, size = "md" }: { patience: number; max: number; size?: "sm" | "md" }) {
  const low = patience <= Math.max(1, Math.floor(max / 3));
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Patience ${patience} of ${max}`}>
      {Array.from({ length: max }).map((_, i) => (
        <Heart
          key={i}
          aria-hidden
          className={`${size === "sm" ? "size-3" : "size-5"} transition-colors duration-500 ${
            i < patience ? (low ? "fill-danger text-danger" : "fill-accent text-accent") : "fill-ink/[0.07] text-ink/15"
          }`}
        />
      ))}
    </span>
  );
}

/** Who the learner is talking to, how it's going, and what they're trying to achieve. */
function PersonaPanel(props: {
  session: SessionView;
  avatar: React.ReactNode;
  onCall: boolean;
  callStartedAt: number | null;
  speaking: boolean;
  turnsUsed: number;
  concluded: boolean;
  hintsLeft: number;
  hintLoading: boolean;
  hintDisabled: boolean;
  onHint: () => void;
}) {
  const { session } = props;
  const { scenario } = session;
  const mood = session.clientMood;
  const firstName = scenario.personaName.split(/\s+/)[0];
  const lowPatience = session.patience <= Math.max(1, Math.floor(session.maxPatience / 3));

  return (
    <aside className="relative z-10 hidden w-80 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-surface/85 p-6 backdrop-blur-xl lg:flex xl:w-96">
      <Link href="/practice" className="-ml-1.5 -mt-1.5 self-start rounded-full p-1.5 text-muted transition-colors hover:bg-ink/5 hover:text-ink" aria-label="Back to scenarios">
        <X className="size-5" aria-hidden />
      </Link>

      <div className="flex flex-col items-center text-center">
        <div className="relative">
          {props.speaking && (
            <>
              <span className="absolute inset-0 rounded-full bg-accent/25 animate-pulse-ring" aria-hidden />
              <span className="absolute inset-0 rounded-full bg-accent/15 animate-pulse-ring [animation-delay:500ms]" aria-hidden />
            </>
          )}
          <span className={`relative block rounded-full shadow-lift ring-4 transition-colors ${props.speaking ? "ring-accent/50" : "ring-surface"}`}>
            {props.avatar}
          </span>
          {props.onCall && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2">
              <OnCallPill startedAt={props.callStartedAt} />
            </span>
          )}
        </div>
        <h2 className="mt-5 font-display text-2xl font-extrabold leading-tight">{scenario.personaName}</h2>
        <p className="mt-0.5 text-sm text-muted">{scenario.personaRole}</p>
        <p className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${MOOD_CHIP[mood]}`} aria-live="polite">
          <span aria-hidden>{MOOD_EMOJI[mood]}</span>
          <span className="sr-only">Mood: </span>
          {MOOD_LABELS[mood]}
        </p>
      </div>

      <section className="rounded-2xl border-2 border-dashed border-accent/40 bg-accent/[0.06] p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted">The situation</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{scenario.userRole}</p>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-ink-2">{firstName}&apos;s patience</h3>
          <span className={`text-sm font-bold tabular-nums ${lowPatience ? "text-danger" : "text-ink-2"}`}>
            {session.patience}/{session.maxPatience}
          </span>
        </div>
        <div className="mt-2">
          <PatienceHearts patience={session.patience} max={session.maxPatience} />
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {session.endReason === "patience_exhausted"
            ? `${firstName} lost patience and hung up.`
            : lowPatience
              ? "Running low. Be specific and get to the point."
              : "Vague, pushy or rude replies use it up. If it runs out, the call ends."}
        </p>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-ink-2">Progress</h3>
          <span className="text-sm tabular-nums text-muted">
            {props.concluded ? "Call ended" : `Turn ${Math.min(props.turnsUsed + 1, session.maxTurns)} of ${session.maxTurns}`}
          </span>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden>
          {Array.from({ length: session.maxTurns }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
                i < props.turnsUsed ? "bg-linear-to-r from-brand to-[#a13df5]" : i === props.turnsUsed && !props.concluded ? "bg-brand/25" : "bg-ink/[0.07]"
              }`}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-brand-soft p-4">
        <h3 className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-ink">
          <Target className="size-3.5" aria-hidden /> Your goal
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{scenario.userGoal}</p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-ink-2">About {firstName}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{scenario.personaDescription}</p>
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {scenario.personalityTraits.map((t) => (
            <li key={t} className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-medium text-ink-2">
              {t}
            </li>
          ))}
        </ul>
      </section>

      {!props.concluded && (
        <button
          type="button"
          onClick={props.onHint}
          disabled={props.hintDisabled}
          className="mt-auto inline-flex items-center gap-1.5 self-start rounded-full bg-lime-soft px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-ink/10 transition-colors hover:bg-lime disabled:bg-transparent disabled:font-medium disabled:text-muted disabled:ring-0"
        >
          {props.hintLoading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Lightbulb className="size-4" aria-hidden />}
          Need a hint? ({props.hintsLeft} left)
        </button>
      )}
    </aside>
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

"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { PipecatClient, type Participant } from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";

export interface PipecatVoiceConfig {
  endpoint: string;
  language: string;
  gender?: "female" | "male";
  /** The persona's Kokoro voice (sets the accent). */
  voice?: string;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302"] }];
// If the agent never reports speaking (e.g. empty text), don't wait on it forever.
const SPEECH_START_TIMEOUT_MS = 8000;
// Give up on a turn's transcript after this long, so the call never gets stuck.
const TRANSCRIPT_TIMEOUT_MS = 20000;

interface LevelMeter {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  samples: Float32Array<ArrayBuffer>;
  target: RefObject<number>;
  gain: number;
}

/** STUN/TURN servers come from the voice agent, so both ends of the call agree on them. */
async function fetchIceServers(offerEndpoint: string): Promise<RTCIceServer[]> {
  try {
    const res = await fetch(offerEndpoint.replace(/\/api\/offer$/, "/api/ice-servers"));
    if (!res.ok) return DEFAULT_ICE_SERVERS;
    const data = (await res.json()) as { iceServers?: RTCIceServer[] };
    return data.iceServers?.length ? data.iceServers : DEFAULT_ICE_SERVERS;
  } catch {
    return DEFAULT_ICE_SERVERS;
  }
}

/**
 * Push-to-talk voice call with the speech agent. The agent only hears the learner between
 * `press()` and `release()`, then reports the whole turn's transcript through `onUserTurn`.
 * What the client says back comes from the app and is spoken with `speak()`.
 */
export function usePipecatVoice(
  config: PipecatVoiceConfig,
  onUserTurn: (text: string, speechMs: number) => void,
  onTurnLost?: () => void,
) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [holding, setHolding] = useState(false);
  // Between releasing the button and the transcript arriving.
  const [transcribing, setTranscribing] = useState(false);
  // From asking the agent to speak until it has finished.
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<PipecatClient | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const connectedRef = useRef(false);
  const holdingRef = useRef(false);
  // How long the learner held the button, for their speaking pace.
  const pressedAtRef = useRef(0);
  const lastSpeechMsRef = useRef(0);
  // Each hold is a numbered turn; only the transcript for the latest one is accepted.
  const turnIdRef = useRef(0);
  const awaitingTurnRef = useRef<number | null>(null);
  const transcriptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTurnLostRef = useRef(onTurnLost);
  onTurnLostRef.current = onTurnLost;
  const speechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Live loudness (0..1) of the client's voice and the learner's mic, for the talking
  // mouth and the mic ring. Read every animation frame, so kept out of React state.
  const botLevelRef = useRef(0);
  const micLevelRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const metersRef = useRef<LevelMeter[]>([]);
  const meterFrameRef = useRef(0);
  const onUserTurnRef = useRef(onUserTurn);
  onUserTurnRef.current = onUserTurn;

  useEffect(() => {
    setAvailable(typeof window !== "undefined" && !!navigator.mediaDevices && !!window.RTCPeerConnection);
  }, []);

  const clearSpeechTimer = () => {
    if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
    speechTimerRef.current = null;
  };

  const measureLevels = () => {
    for (const m of metersRef.current) {
      m.analyser.getFloatTimeDomainData(m.samples);
      let sum = 0;
      for (const v of m.samples) sum += v * v;
      m.target.current = Math.min(1, Math.sqrt(sum / m.samples.length) * m.gain);
    }
    meterFrameRef.current = requestAnimationFrame(measureLevels);
  };

  const addMeter = (track: MediaStreamTrack, target: RefObject<number>, gain: number) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    metersRef.current.push({ source, analyser, samples: new Float32Array(analyser.fftSize), target, gain });
    if (!meterFrameRef.current) meterFrameRef.current = requestAnimationFrame(measureLevels);
  };

  const stopMeters = () => {
    cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = 0;
    for (const m of metersRef.current) m.source.disconnect();
    metersRef.current = [];
    botLevelRef.current = 0;
    micLevelRef.current = 0;
  };

  const setLive = (live: boolean) => {
    connectedRef.current = live;
    setConnected(live);
    if (!live) {
      holdingRef.current = false;
      setHolding(false);
      setTranscribing(false);
      setSpeaking(false);
      clearSpeechTimer();
      stopMeters();
      awaitingTurnRef.current = null;
      if (transcriptTimerRef.current) clearTimeout(transcriptTimerRef.current);
    }
  };

  const connect = useCallback(async () => {
    if (!available || clientRef.current) return;
    setError(null);
    setConnecting(true);
    // Create the audio element and context inside the click handler so the browser lets them play.
    const audio = audioRef.current ?? new Audio();
    audio.autoplay = true;
    audioRef.current = audio;
    try {
      audioCtxRef.current ??= new AudioContext();
      void audioCtxRef.current.resume();
    } catch {
      // Without Web Audio the mouth falls back to a simulated rhythm.
    }
    try {
      const client = new PipecatClient({
        transport: new SmallWebRTCTransport({ iceServers: await fetchIceServers(config.endpoint) }),
        enableMic: true,
        enableCam: false,
        callbacks: {
          onConnected: () => setLive(true),
          onDisconnected: () => setLive(false),
          // The client doesn't play the agent's voice itself; route its audio track to the speaker.
          onTrackStarted: (track: MediaStreamTrack, participant?: Participant) => {
            if (track.kind !== "audio") return;
            if (participant?.local) {
              addMeter(track, micLevelRef, 9);
              return;
            }
            audio.srcObject = new MediaStream([track]);
            void audio.play().catch(() => setError("Tap anywhere to allow audio playback."));
            addMeter(track, botLevelRef, 5);
          },
          onBotStartedSpeaking: () => {
            clearSpeechTimer();
            setSpeaking(true);
          },
          onBotStoppedSpeaking: () => setSpeaking(false),
          onServerMessage: (data: { type?: string; id?: number; text?: string }) => {
            // A transcript for an earlier turn (e.g. one that was slow) is never used for this one.
            if (data?.type !== "user_turn" || data.id !== awaitingTurnRef.current) return;
            awaitingTurnRef.current = null;
            if (transcriptTimerRef.current) clearTimeout(transcriptTimerRef.current);
            setTranscribing(false);
            onUserTurnRef.current((data.text ?? "").trim(), lastSpeechMsRef.current);
          },
          onError: (event) => setError(event instanceof Error ? event.message : "The voice agent failed."),
        },
      });
      clientRef.current = client;
      const botConfig = encodeURIComponent(JSON.stringify({ language: config.language, gender: config.gender, voice: config.voice }));
      await client.connect({ connection_url: `${config.endpoint}?config=${botConfig}` });
    } catch (err) {
      clientRef.current = null;
      setError(err instanceof Error ? err.message : "Could not connect to the voice agent.");
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [available, config.endpoint, config.language, config.gender, config.voice]);

  const press = useCallback(() => {
    if (!connectedRef.current || holdingRef.current) return;
    holdingRef.current = true;
    pressedAtRef.current = performance.now();
    turnIdRef.current += 1;
    setHolding(true);
    // The agent stops talking on press, like talking over someone on a call.
    setSpeaking(false);
    clearSpeechTimer();
    clientRef.current?.sendClientMessage("ptt", { pressed: true, id: turnIdRef.current });
  }, []);

  const release = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    lastSpeechMsRef.current = Math.round(performance.now() - pressedAtRef.current);
    awaitingTurnRef.current = turnIdRef.current;
    setHolding(false);
    setTranscribing(true);
    clientRef.current?.sendClientMessage("ptt", { pressed: false });
    if (transcriptTimerRef.current) clearTimeout(transcriptTimerRef.current);
    transcriptTimerRef.current = setTimeout(() => {
      awaitingTurnRef.current = null;
      setTranscribing(false);
      onTurnLostRef.current?.();
    }, TRANSCRIPT_TIMEOUT_MS);
  }, []);

  const speak = useCallback((text: string) => {
    if (!connectedRef.current || !text.trim()) return;
    setSpeaking(true);
    clearSpeechTimer();
    speechTimerRef.current = setTimeout(() => setSpeaking(false), SPEECH_START_TIMEOUT_MS);
    clientRef.current?.sendClientMessage("speak", { text });
  }, []);

  const disconnect = useCallback(() => {
    void clientRef.current?.disconnect();
    clientRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    setLive(false);
  }, []);

  useEffect(() => disconnect, [disconnect]);

  return {
    available,
    botLevelRef,
    micLevelRef,
    connecting,
    connected,
    connectedRef,
    holding,
    transcribing,
    speaking,
    error,
    connect,
    disconnect,
    press,
    release,
    speak,
  };
}

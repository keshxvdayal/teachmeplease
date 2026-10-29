"use client";

// Phone-call sounds, synthesized with Web Audio so there are no audio files to ship.

let ctx: AudioContext | null = null;

/** Call from a click handler first, so the browser allows the audio. */
export function unlockCallSounds() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(freqs: number[], start: number, duration: number, volume: number, dest?: AudioNode) {
  if (!ctx) return;
  const gain = ctx.createGain();
  gain.connect(dest ?? ctx.destination);
  // Short ramps avoid clicks at the edges of each tone.
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.02);
  gain.gain.setValueAtTime(volume, start + duration - 0.03);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  for (const f of freqs) {
    const osc = ctx.createOscillator();
    osc.frequency.value = f;
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + duration);
  }
}

/** A bell-like note that decays, for the incoming ringtone. */
function chime(freq: number, start: number, dest: AudioNode) {
  if (!ctx) return;
  const gain = ctx.createGain();
  gain.connect(dest);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(0.16, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
  for (const [mult, type] of [
    [1, "sine"],
    [2, "triangle"],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq * mult;
    osc.connect(gain);
    osc.start(start);
    osc.stop(start + 0.55);
  }
}

/** Repeats `pattern` every `period` seconds until the returned function is called. */
function loop(pattern: (t: number, bus: AudioNode) => void, period: number): () => void {
  if (!ctx) return () => {};
  const audio = ctx;
  // Everything in the loop goes through one bus, so stopping can silence notes already scheduled.
  const bus = audio.createGain();
  bus.connect(audio.destination);
  let next = audio.currentTime + 0.05;
  const schedule = () => {
    while (next < audio.currentTime + 1) {
      pattern(next, bus);
      next += period;
    }
  };
  schedule();
  const timer = setInterval(schedule, 250);
  return () => {
    clearInterval(timer);
    bus.gain.setTargetAtTime(0, audio.currentTime, 0.02);
    setTimeout(() => bus.disconnect(), 200);
  };
}

/** The ringback you hear while the other phone rings: "brr-brr … brr-brr". */
export function playRingback(): () => void {
  return loop((t, bus) => {
    tone([400, 450], t, 0.4, 0.07, bus);
    tone([400, 450], t + 0.6, 0.4, 0.07, bus);
  }, 3);
}

/** An incoming-call ringtone. */
export function playRingtone(): () => void {
  return loop((t, bus) => {
    [659, 831, 988, 1319].forEach((f, i) => chime(f, t + i * 0.13, bus));
    [659, 831, 988, 1319].forEach((f, i) => chime(f, t + 0.8 + i * 0.13, bus));
  }, 2.6);
}

/** A short blip as the call connects. */
export function playConnected() {
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  tone([880], t, 0.08, 0.06);
  tone([1320], t + 0.1, 0.1, 0.06);
}

/** The hang-up beeps. Resolves when they've finished. */
export function playHangup(): Promise<void> {
  if (!ctx) return Promise.resolve();
  const t = ctx.currentTime + 0.02;
  [620, 520, 420].forEach((f, i) => tone([f], t + i * 0.24, 0.18, 0.08));
  return new Promise((resolve) => setTimeout(resolve, 800));
}

"use client";

import { useEffect, useId, useRef, type RefObject } from "react";
import type { Mood } from "@/lib/roleplay/moods";

const SKIN = [
  { base: "#f6d2b8", shade: "#e4b394" },
  { base: "#e9b48f", shade: "#d39570" },
  { base: "#c98d63", shade: "#ad7149" },
  { base: "#a86b45", shade: "#8b5434" },
  { base: "#7a4a2e", shade: "#613822" },
];
const HAIR = ["#2b1d16", "#4a2f22", "#6b3f23", "#a5662f", "#1c1a22", "#c9a26a"];
const SHIRT = ["#5b3df5", "#ff6a3d", "#0b7a57", "#2563eb", "#b4277a", "#17131f"];
const BACKDROP = ["#efebff", "#ffede5", "#f4ffd1", "#e4f6ee", "#fdf1dc"];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A stable look per persona, so the same client always looks the same. */
function lookFor(seed: string) {
  const h = hash(seed);
  const pick = <T,>(list: T[], shift: number) => list[(h >>> shift) % list.length];
  return {
    skin: pick(SKIN, 0),
    hair: pick(HAIR, 3),
    shirt: pick(SHIRT, 7),
    backdrop: pick(BACKDROP, 11),
    style: (h >>> 15) % 2,
    glasses: (h >>> 17) % 4 === 0,
    facialHair: (h >>> 19) % 3, // male only: 0 none, 1 moustache, 2 stubble
  };
}

// Eyebrows show the mood at a glance.
const BROWS: Record<Mood, [string, string]> = {
  frustrated: ["M43 45 L54 49", "M66 49 L77 45"],
  skeptical: ["M43 47 L54 47", "M66 44 Q71 41 77 43"],
  neutral: ["M43 47 Q48.5 45.5 54 46.5", "M66 46.5 Q71.5 45.5 77 47"],
  warming: ["M43 47 Q48.5 44 54 46", "M66 46 Q71.5 44 77 47"],
  cooperative: ["M43 46 Q48.5 42.5 54 45", "M66 45 Q71.5 42.5 77 46"],
};
// The resting mouth, when they're not talking.
const MOUTHS: Record<Mood, string> = {
  frustrated: "M53 73.5 Q60 68.5 67 73.5",
  skeptical: "M53 71.5 Q60 72.5 67 69",
  neutral: "M54 71 Q60 72.5 66 71",
  warming: "M53 70 Q60 75 67 70",
  cooperative: "M52 69 Q60 78 68 69",
};

export function PersonaAvatar({
  seed,
  name,
  gender,
  mood,
  size = 48,
  speaking = false,
  levelRef,
  className = "",
}: {
  seed: string;
  name: string;
  gender: "female" | "male";
  mood: Mood;
  size?: number;
  /** Animates the mouth. Without `levelRef` the movement is simulated. */
  speaking?: boolean;
  /** Live loudness of the voice (0..1), read every frame to open the mouth on syllables. */
  levelRef?: RefObject<number>;
  className?: string;
}) {
  const look = lookFor(seed);
  const clipId = useId();
  const openRef = useRef<SVGEllipseElement>(null);
  const restRef = useRef<SVGPathElement>(null);
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;

  // Drive the mouth outside React so it can move every frame without re-rendering.
  useEffect(() => {
    let frame = 0;
    let open = 0;
    const tick = (t: number) => {
      let target = 0;
      if (speakingRef.current) {
        target = levelRef
          ? Math.min(1, (levelRef.current ?? 0) * 1.6)
          : // No audio to measure (browser voice): a natural-looking syllable rhythm.
            0.35 + 0.3 * Math.sin(t / 55) + 0.25 * Math.sin(t / 23 + 1.3);
      }
      // Open fast, close a little slower, like a real jaw.
      open += (target - open) * (target > open ? 0.55 : 0.3);
      const visible = open > 0.06;
      openRef.current?.setAttribute("ry", (0.8 + open * 5.2).toFixed(2));
      openRef.current?.setAttribute("rx", (4.6 + open * 1.6).toFixed(2));
      openRef.current?.setAttribute("opacity", visible ? "1" : "0");
      restRef.current?.setAttribute("opacity", visible ? "0" : "1");
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [levelRef]);

  const female = gender === "female";
  const warm = mood === "warming" || mood === "cooperative";

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      role="img"
      aria-label={`${name}${speaking ? ", speaking" : ""}`}
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="60" cy="60" r="60" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="120" height="120" fill={look.backdrop} />

        {/* Long hair falls behind the shoulders */}
        {female && look.style === 0 && (
          <path d="M31 58 C27 26 93 26 89 58 L95 104 C80 110 40 110 25 104 Z" fill={look.hair} />
        )}

        {/* Shoulders and shirt */}
        <path d="M14 122 C17 98 37 89 60 89 C83 89 103 98 106 122 Z" fill={look.shirt} />
        <path d="M49 89.5 L60 102 L71 89.5 Z" fill="#fff" opacity="0.9" />
        <rect x="51" y="73" width="18" height="19" rx="7" fill={look.skin.shade} />

        {/* Head */}
        <ellipse cx="36" cy="60" rx="5" ry="7" fill={look.skin.shade} />
        <ellipse cx="84" cy="60" rx="5" ry="7" fill={look.skin.shade} />
        <ellipse cx="60" cy="56" rx="24" ry="28" fill={look.skin.base} />

        {/* Hair */}
        {female ? (
          look.style === 0 ? (
            <path d="M34 58 C28 13 92 13 86 58 C81 42 70 35 60 39 C50 35 39 42 34 58 Z" fill={look.hair} />
          ) : (
            <>
              <circle cx="60" cy="24" r="10" fill={look.hair} />
              <path d="M34.5 55 C29 14 91 14 85.5 55 C80 41 69 34 60 36 C50 34 40 41 34.5 55 Z" fill={look.hair} />
            </>
          )
        ) : look.style === 0 ? (
          <path d="M34.5 54 C29 14 91 14 85.5 54 C83 41 73 34 60 35 C47 34 37 41 34.5 54 Z" fill={look.hair} />
        ) : (
          <path d="M34 55 C27 12 93 10 86 52 C84 40 76 33 66 37 C54 29 40 37 34 55 Z" fill={look.hair} />
        )}

        {/* Brows */}
        {BROWS[mood].map((d) => (
          <path key={d} d={d} fill="none" stroke={look.hair} strokeWidth="2.6" strokeLinecap="round" className="transition-all duration-500" />
        ))}

        {/* Eyes, blinking now and then */}
        <g className="avatar-blink">
          <ellipse cx="49" cy="55" rx="2.7" ry="3.3" fill="#17131f" />
          <ellipse cx="71" cy="55" rx="2.7" ry="3.3" fill="#17131f" />
          <circle cx="50" cy="54" r="0.9" fill="#fff" />
          <circle cx="72" cy="54" r="0.9" fill="#fff" />
        </g>
        {look.glasses && (
          <g fill="none" stroke="#17131f" strokeWidth="1.8" opacity="0.85">
            <rect x="41" y="49" width="16" height="12" rx="5" />
            <rect x="63" y="49" width="16" height="12" rx="5" />
            <path d="M57 54 L63 54" />
          </g>
        )}

        {/* Cheeks warm up as they come round */}
        <circle cx="43" cy="65" r="4.5" fill="#ff6a3d" opacity={warm ? 0.22 : 0} className="transition-opacity duration-700" />
        <circle cx="77" cy="65" r="4.5" fill="#ff6a3d" opacity={warm ? 0.22 : 0} className="transition-opacity duration-700" />

        <path d="M60 57 Q62.5 63 58.5 64.5" fill="none" stroke={look.skin.shade} strokeWidth="1.8" strokeLinecap="round" />

        {!female && look.facialHair === 2 && (
          <path d="M42 66 C44 82 54 85 60 85 C66 85 76 82 78 66 C74 76 67 79 60 79 C53 79 46 76 42 66 Z" fill={look.hair} opacity="0.28" />
        )}

        {/* Mouth: a resting expression, or open in time with the voice */}
        <path ref={restRef} d={MOUTHS[mood]} fill="none" stroke="#7a2a33" strokeWidth="2.2" strokeLinecap="round" className="transition-all duration-500" />
        <ellipse ref={openRef} cx="60" cy="71.5" rx="4.6" ry="0.8" fill="#5a1d29" opacity="0" />

        {!female && look.facialHair === 1 && (
          <path d="M51 67.5 C54 64.5 58 65.5 60 67 C62 65.5 66 64.5 69 67.5 C66 69.5 62 69 60 68.5 C58 69 54 69.5 51 67.5 Z" fill={look.hair} />
        )}
      </g>
    </svg>
  );
}

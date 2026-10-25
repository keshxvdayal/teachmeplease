import {
  AlarmClock,
  CalendarClock,
  Flame,
  HandCoins,
  Layers,
  MessagesSquare,
  PhoneCall,
  TrendingUp,
  Wand2,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface ScenarioTheme {
  icon: LucideIcon;
  /** Short line the AI client might say — used as a visual teaser, not part of the scenario prompt. */
  hook: string;
  /** Classes for the illustrated card header. */
  panel: string;
  /** Text colours that read on `panel`. */
  panelText: string;
  panelSubtext: string;
  iconChip: string;
  bubble: string;
  glow: string;
}

const themes: Record<string, ScenarioTheme> = {
  "pricing-negotiation": {
    icon: HandCoins,
    hook: "4,800 is well above what we expected…",
    panel: "bg-linear-to-br from-[#6b4ff7] via-[#7d4af2] to-[#a13df5]",
    panelText: "text-white",
    panelSubtext: "text-white/85",
    iconChip: "bg-white/15 text-white ring-white/25",
    bubble: "bg-white text-ink",
    glow: "group-hover:shadow-[0_24px_48px_-20px_rgb(91_61_245/0.55)]",
  },
  "difficult-client": {
    icon: Flame,
    hook: "Honestly? I'm frustrated. The demo is in ten days.",
    panel: "bg-linear-to-br from-[#e2502b] via-[#d63a4c] to-[#a82f6e]",
    panelText: "text-white",
    panelSubtext: "text-white",
    iconChip: "bg-white/20 text-white ring-white/30",
    bubble: "bg-white text-ink",
    glow: "group-hover:shadow-[0_24px_48px_-20px_rgb(255_106_61/0.6)]",
  },
  "overdue-payment": {
    icon: CalendarClock,
    hook: "It's definitely coming — finance is just slow.",
    panel: "bg-linear-to-br from-[#c6f24e] via-lime to-[#7ee0a8]",
    panelText: "text-ink",
    panelSubtext: "text-ink/80",
    iconChip: "bg-ink/10 text-ink ring-ink/10",
    bubble: "bg-night text-white",
    glow: "group-hover:shadow-[0_24px_48px_-20px_rgb(110_170_40/0.55)]",
  },
  "discovery-call": {
    icon: PhoneCall,
    hook: "So roughly how much would something like that cost?",
    panel: "bg-linear-to-br from-[#2bb3c0] via-[#3a8ee6] to-[#5b3df5]",
    panelText: "text-white",
    panelSubtext: "text-white/85",
    iconChip: "bg-white/15 text-white ring-white/25",
    bubble: "bg-white text-ink",
    glow: "group-hover:shadow-[0_24px_48px_-20px_rgb(58_142_230/0.55)]",
  },
  "rush-request": {
    icon: Zap,
    hook: "All ten slides by tomorrow morning — same price?",
    panel: "bg-linear-to-br from-[#ffc24d] via-[#ff8a3d] to-accent",
    panelText: "text-ink",
    panelSubtext: "text-ink/80",
    iconChip: "bg-ink/10 text-ink ring-ink/10",
    bubble: "bg-night text-white",
    glow: "group-hover:shadow-[0_24px_48px_-20px_rgb(255_138_61/0.6)]",
  },
  "scope-creep": {
    icon: Layers,
    hook: "Just a few small extras. Should be quick, right?",
    panel: "bg-linear-to-br from-[#7d4af2] via-[#a13df5] to-[#d63a9a]",
    panelText: "text-white",
    panelSubtext: "text-white/85",
    iconChip: "bg-white/15 text-white ring-white/25",
    bubble: "bg-white text-ink",
    glow: "group-hover:shadow-[0_24px_48px_-20px_rgb(161_61_245/0.55)]",
  },
  "rate-increase": {
    icon: TrendingUp,
    hook: "You said there was something to discuss?",
    panel: "bg-linear-to-br from-night via-night-2 to-[#3a2a7a]",
    panelText: "text-white",
    panelSubtext: "text-white/80",
    iconChip: "bg-lime/90 text-ink ring-white/10",
    bubble: "bg-lime text-ink",
    glow: "group-hover:shadow-[0_24px_48px_-20px_rgb(59_34_184/0.6)]",
  },
  "missed-deadline": {
    icon: AlarmClock,
    hook: "Everything on track for Thursday?",
    panel: "bg-linear-to-br from-[#1d4ed8] via-[#3b3df5] to-[#6b4ff7]",
    panelText: "text-white",
    panelSubtext: "text-white/85",
    iconChip: "bg-white/15 text-white ring-white/25",
    bubble: "bg-white text-ink",
    glow: "group-hover:shadow-[0_24px_48px_-20px_rgb(59_61_245/0.55)]",
  },
  "unhappy-with-work": {
    icon: Wand2,
    hook: "I don't love any of them. It doesn't feel like us.",
    panel: "bg-linear-to-br from-[#ffd1dc] via-[#f7a8bf] to-[#e77fa0]",
    panelText: "text-ink",
    panelSubtext: "text-ink/80",
    iconChip: "bg-ink/10 text-ink ring-ink/10",
    bubble: "bg-night text-white",
    glow: "group-hover:shadow-[0_24px_48px_-20px_rgb(231_127_160/0.6)]",
  },
};

const fallback: ScenarioTheme = {
  icon: MessagesSquare,
  hook: "So, what do you suggest?",
  panel: "bg-linear-to-br from-night-2 to-night",
  panelText: "text-white",
  panelSubtext: "text-white/80",
  iconChip: "bg-white/10 text-white ring-white/20",
  bubble: "bg-white text-ink",
  glow: "group-hover:shadow-lift",
};

export function scenarioTheme(id: string): ScenarioTheme {
  return themes[id] ?? fallback;
}

// Server-side usage limits. Override any value with the matching env var.

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const limits = {
  anonSessionsPerDay: intFromEnv("LIMIT_ANON_SESSIONS_PER_DAY", 3),
  // Shared cap per IP across anonymous visitors, so clearing cookies doesn't reset the allowance.
  anonSessionsPerIpPerDay: intFromEnv("LIMIT_ANON_SESSIONS_PER_IP_PER_DAY", 8),
  userSessionsPerDay: intFromEnv("LIMIT_USER_SESSIONS_PER_DAY", 10),
  messagesPerDay: intFromEnv("LIMIT_MESSAGES_PER_DAY", 120),
  // Whole-app ceiling on AI calls per UTC day. Keeps us inside the provider's free tier.
  globalAiRequestsPerDay: intFromEnv("LIMIT_GLOBAL_AI_REQUESTS_PER_DAY", 240),
  maxUserMessageChars: intFromEnv("LIMIT_MAX_USER_MESSAGE_CHARS", 600),
  maxAiReplyChars: intFromEnv("LIMIT_MAX_AI_REPLY_CHARS", 700),
  // Hard ceiling regardless of what a scenario file asks for.
  maxTurnsCeiling: intFromEnv("LIMIT_MAX_TURNS_CEILING", 10),
  scoringAttemptsPerSession: intFromEnv("LIMIT_SCORING_ATTEMPTS", 3),
  // How long a per-session lock is held while an AI call is in flight.
  sessionLockMs: 45_000,
  roleplayTimeoutMs: 20_000,
  scoringTimeoutMs: 60_000,
} as const;

export const retention = {
  anonymousDays: intFromEnv("RETENTION_ANON_DAYS", 30),
  userDays: intFromEnv("RETENTION_USER_DAYS", 365),
} as const;

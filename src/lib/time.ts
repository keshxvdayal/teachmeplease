export function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function secondsUntilUtcMidnight(now = new Date()): number {
  const next = startOfUtcDay(now).getTime() + 86_400_000;
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

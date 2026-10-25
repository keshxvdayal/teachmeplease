// Small in-memory sliding-window limiter for abuse-prone endpoints (sign-in, sign-up, waitlist).
// Per-instance only; the authoritative usage limits live in the database.

const buckets = new Map<string, number[]>();

export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) buckets.clear();
  return true;
}

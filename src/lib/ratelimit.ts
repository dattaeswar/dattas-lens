/**
 * In-memory sliding-window rate limiter, per key (IP). Good for a single
 * server instance; move to Redis/Upstash when scaling horizontally.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

const hits = new Map<string, number[]>();

export function rateLimit(key: string): {
  allowed: boolean;
  retryAfterSec: number;
} {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const timestamps = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= MAX_REQUESTS) {
    const retryAfterSec = Math.ceil((timestamps[0] + WINDOW_MS - now) / 1000);
    hits.set(key, timestamps);
    return { allowed: false, retryAfterSec };
  }

  timestamps.push(now);
  hits.set(key, timestamps);

  // opportunistic cleanup so the map doesn't grow unbounded
  if (hits.size > 10_000) {
    for (const [k, v] of hits) {
      if (v.every((t) => t <= windowStart)) hits.delete(k);
    }
  }

  return { allowed: true, retryAfterSec: 0 };
}

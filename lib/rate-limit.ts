// Lightweight in-memory sliding-window rate limiter.
//
// NOTE: on serverless (Vercel) each function instance has its own memory, so
// this reliably throttles bursts that hit the same warm instance but is NOT a
// hard cross-instance guarantee. It's intended as a cheap cost/abuse guard for
// expensive endpoints (Gemini/Gmail). If a strict limit is ever needed, back it
// with a shared store (DB row count like Ask LitCal, or Redis/Upstash).

const hits = new Map<string, number[]>();

/**
 * Records a hit for `key` and returns true if it's within the limit, false if
 * the caller should be rejected (HTTP 429).
 *
 * @param key       unique bucket, e.g. `inbox-scan:${userId}`
 * @param limit     max allowed hits within the window
 * @param windowMs  window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }

  recent.push(now);
  hits.set(key, recent);

  // Opportunistic cleanup so the map doesn't grow unbounded across many keys.
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      const live = times.filter((t) => t > cutoff);
      if (live.length === 0) hits.delete(k);
      else hits.set(k, live);
    }
  }

  return true;
}

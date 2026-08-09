// In-memory sliding-window rate limiter (alpha, single-instance — same
// server-memory model as lib/engine/cache.ts). Resets on restart. For real
// multi-instance deployments this would move to a shared store (Redis).

interface Bucket {
  hits: number[]; // timestamps (ms) within the window
}

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_HITS = 12; // generous for alpha; blocks runaway/abuse
const MAX_KEYS = 2000; // cap memory

/**
 * Returns { allowed, retryAfter }. Records a hit when allowed.
 * `key` should identify the caller (session token, else IP).
 */
export function checkRateLimit(key: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_KEYS) buckets.clear(); // crude but bounded
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  // Drop timestamps outside the window.
  bucket.hits = bucket.hits.filter((t) => now - t < WINDOW_MS);
  if (bucket.hits.length >= MAX_HITS) {
    const oldest = bucket.hits[0];
    const retryAfter = Math.ceil((WINDOW_MS - (now - oldest)) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }
  bucket.hits.push(now);
  return { allowed: true, retryAfter: 0 };
}

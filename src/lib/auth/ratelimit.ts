/**
 * In-memory fixed-window rate limiter (per-process). Adequate for a single-node MVP and
 * tests; production uses a shared store (Redis) — that is the post-MVP hook (ADR-10).
 * Keyed by an arbitrary string (e.g. `login:<ip>`).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateResult {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }
  if (b.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: b.resetAt - now };
  }
  b.count++;
  return { allowed: true, remaining: limit - b.count, retryAfterMs: 0 };
}

/** Extracts a best-effort client IP from request headers (behind a proxy/CDN). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Test helper: clear all buckets. */
export function _resetRateLimits() {
  buckets.clear();
}

/**
 * Lightweight in-memory rate limiter for public endpoints (share links, the
 * signing page). Per-instance only — on serverless each warm instance keeps
 * its own buckets, so this is a abuse-dampener rather than a hard global
 * guarantee, which is the right tradeoff for these read-mostly endpoints.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  if (b.count > max) return false;
  return true;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : "").trim() || "unknown";
}

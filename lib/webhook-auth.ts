import crypto from "crypto";

/**
 * Verify a Vapi webhook's shared-secret header (x-vapi-secret).
 *
 * Fail-closed: if VAPI_SERVER_SECRET is not configured, NO request is trusted.
 * The old `if (secret && header !== secret)` pattern skipped the check entirely
 * when the env var was unset — a deploy that forgot the secret ran wide open,
 * letting anyone POST a crafted caller number and act on / read that account.
 * Now a missing secret rejects every call instead.
 *
 * Constant-time comparison so the secret can't be recovered byte-by-byte via
 * response timing.
 */
export function verifyVapiSecret(req: Request): boolean {
  const secret = process.env.VAPI_SERVER_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-vapi-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

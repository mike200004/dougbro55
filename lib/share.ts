import crypto from "crypto";

/**
 * Capability tokens for public document links: `<docId>.<hmac>`, base64url.
 * The HMAC (keyed by a server secret) makes the link unguessable, so no extra
 * DB column/migration is needed — possession of the token grants read access.
 */
function secret(): string {
  // Prefer a dedicated SHARE_SECRET; fall back to the service-role key so
  // existing links keep validating until a dedicated secret is rolled out.
  const s = process.env.SHARE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (s) return s;
  // No signing key at all. In production, fail closed — never sign/verify with
  // a guessable literal (that would let anyone forge share/sign links). Only
  // local dev gets a fixed fallback.
  if (process.env.NODE_ENV === "production") {
    throw new Error("SHARE_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set to sign document links.");
  }
  return "pheme-dev-secret-local-only";
}

function sign(docId: string): string {
  return crypto.createHmac("sha256", secret()).update(docId).digest("hex").slice(0, 32);
}

export function makeShareToken(docId: string): string {
  const raw = `${docId}.${sign(docId)}`;
  return Buffer.from(raw).toString("base64url");
}

// Signing-session tokens are namespaced so a share token can never be used to
// sign and vice versa.
function signSig(requestId: string): string {
  return crypto
    .createHmac("sha256", secret())
    .update(`sign:${requestId}`)
    .digest("hex")
    .slice(0, 32);
}

export function makeSignToken(requestId: string): string {
  return Buffer.from(`${requestId}.${signSig(requestId)}`).toString("base64url");
}

export function verifySignToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf-8");
    const dot = raw.lastIndexOf(".");
    if (dot < 0) return null;
    const id = raw.slice(0, dot);
    const mac = raw.slice(dot + 1);
    const expected = signSig(id);
    if (mac.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
    return id;
  } catch {
    return null;
  }
}

export function verifyShareToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf-8");
    const dot = raw.lastIndexOf(".");
    if (dot < 0) return null;
    const docId = raw.slice(0, dot);
    const mac = raw.slice(dot + 1);
    const expected = sign(docId);
    if (mac.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
    return docId;
  } catch {
    return null;
  }
}

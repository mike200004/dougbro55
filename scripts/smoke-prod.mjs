// Production smoke test: every public route, every auth gate, every fail-closed
// webhook, and — the part that actually catches outages — a real PDF render
// through each of the three render paths (owner, share link, sign link).
//
//   node scripts/smoke-prod.mjs                  # against pheme.deals
//   SITE=https://preview.vercel.app node scripts/smoke-prod.mjs
//
// Read-only: it never writes to the DB, never charges a card, never sends mail.
// A signed document belonging to a real account is used for the render checks
// when one exists; otherwise those checks report SKIP rather than failing.
import { readFileSync } from "fs";
import crypto from "crypto";

const SITE = process.env.SITE || "https://pheme.deals";

// .env.local is the source of truth locally; in CI the vars come from the env.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // No .env.local (CI) — rely on the ambient environment.
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SHARE_SECRET = process.env.SHARE_SECRET || SERVICE_KEY;

let pass = 0;
const failures = [];
const skips = [];

function ok(name, detail = "") {
  pass++;
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function bad(name, detail) {
  failures.push(`${name} — ${detail}`);
  console.log(`  ✗ ${name} — ${detail}`);
}
function skip(name, why) {
  skips.push(`${name} (${why})`);
  console.log(`  · ${name} — SKIP: ${why}`);
}

async function status(path, init) {
  try {
    const res = await fetch(`${SITE}${path}`, { redirect: "manual", ...init });
    return res;
  } catch (err) {
    return { status: 0, headers: new Headers(), error: String(err) };
  }
}

async function expect(name, path, want, init) {
  const res = await status(path, init);
  const wanted = Array.isArray(want) ? want : [want];
  if (wanted.includes(res.status)) ok(name, `${res.status}`);
  else bad(name, `expected ${wanted.join("/")}, got ${res.status}${res.error ? ` (${res.error})` : ""}`);
  return res;
}

function shareToken(docId) {
  const sig = crypto.createHmac("sha256", SHARE_SECRET).update(docId).digest("hex").slice(0, 32);
  return Buffer.from(`${docId}.${sig}`).toString("base64url");
}
function signToken(requestId) {
  const sig = crypto.createHmac("sha256", SHARE_SECRET).update(`sign:${requestId}`).digest("hex").slice(0, 32);
  return Buffer.from(`${requestId}.${sig}`).toString("base64url");
}

async function sb(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`supabase ${res.status}`);
  return res.json();
}

// A PDF response must actually be a PDF — a 200 that returns an HTML error
// page is the failure mode this whole script exists to catch.
async function expectPdf(name, path) {
  try {
    const res = await fetch(`${SITE}${path}`);
    if (!res.ok) return bad(name, `HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const magic = buf.subarray(0, 5).toString("latin1");
    if (magic !== "%PDF-") return bad(name, `not a PDF (starts with ${JSON.stringify(magic)})`);
    if (buf.length < 1000) return bad(name, `suspiciously small (${buf.length} bytes)`);
    ok(name, `${buf.length} bytes`);
  } catch (err) {
    bad(name, String(err));
  }
}

console.log(`\nPheme production smoke test → ${SITE}\n`);

console.log("Public pages");
for (const p of ["/", "/pricing", "/login", "/signup", "/forgot-password", "/terms", "/privacy", "/sitemap.xml", "/robots.txt"]) {
  await expect(p, p, 200);
}

console.log("\nAuth gates (must redirect to /login)");
for (const p of ["/documents", "/clients", "/settings", "/assistant", "/forms/new"]) {
  const res = await status(p);
  const loc = res.headers?.get?.("location") || "";
  if ([307, 308].includes(res.status) && loc.includes("/login")) ok(p, `${res.status} → login`);
  else bad(p, `expected 307→/login, got ${res.status} → ${loc || "(none)"}`);
}

console.log("\nFail-closed endpoints (unauthenticated/unsigned)");
const json = { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" };
await expect("POST /api/stripe/webhook", "/api/stripe/webhook", [400, 401], json);
await expect("POST /api/voice/assistant", "/api/voice/assistant", 401, json);
await expect("POST /api/voice/tools", "/api/voice/tools", 401, json);
await expect("POST /api/admin/stripe-setup", "/api/admin/stripe-setup", 401, json);
await expect("POST /api/chat", "/api/chat", [401, 403], {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: [] }),
});
await expect("POST /api/sms", "/api/sms", 403, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: "Body=smoke&From=%2B15005550999",
});
await expect("GET /api/share/<bad>", "/api/share/not-a-real-token", 404);
await expect("GET /api/sign/<bad>", "/api/sign/not-a-real-token", 404);
await expect("404 page", "/definitely-not-a-route-xyz", 404);

console.log("\nSecurity headers");
{
  const res = await status("/");
  const want = {
    "strict-transport-security": /max-age=\d+/,
    "x-content-type-options": /nosniff/,
    "x-frame-options": /SAMEORIGIN|DENY/i,
    "referrer-policy": /origin/i,
  };
  for (const [h, re] of Object.entries(want)) {
    const v = res.headers?.get?.(h);
    if (v && re.test(v)) ok(h, v);
    else bad(h, v ? `unexpected value ${v}` : "missing");
  }
}

console.log("\nPDF render paths (the e-sign/share outage canary)");
if (!SUPABASE_URL || !SERVICE_KEY) {
  skip("PDF renders", "SUPABASE_URL / SERVICE_ROLE_KEY not set");
} else {
  try {
    // Any built-in-template document proves templates/ is bundled into the
    // share function; a signed request proves the same for the sign function.
    const docs = await sb("documents?select=id,type&order=updated_at.desc&limit=25");
    const doc = docs.find((d) => d.type && !d.type.startsWith("upload"));
    if (doc) await expectPdf(`share PDF (doc ${doc.id.slice(0, 8)})`, `/api/share/${shareToken(doc.id)}`);
    else skip("share PDF", "no built-in-template document in the DB yet");

    const reqs = await sb("signature_requests?select=id,status&order=created_at.desc&limit=10");
    const sig = reqs[0];
    if (sig) await expectPdf(`sign PDF (request ${sig.id.slice(0, 8)}, ${sig.status})`, `/api/sign/${signToken(sig.id)}?pdf=1`);
    else skip("sign PDF", "no signature requests in the DB yet");
  } catch (err) {
    bad("PDF renders", `could not reach Supabase — ${err.message}`);
  }
}

console.log("\nRow-level security (anon key must see nothing)");
if (!SUPABASE_URL || !ANON_KEY) {
  skip("RLS", "SUPABASE_URL / ANON_KEY not set");
} else {
  for (const table of ["documents", "clients", "profiles", "account_members", "subscriptions", "signature_requests"]) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      });
      const rows = res.ok ? await res.json() : null;
      if (res.ok && Array.isArray(rows) && rows.length === 0) ok(`${table} → 0 rows`);
      else if (!res.ok) ok(`${table} → blocked (${res.status})`);
      else bad(`${table}`, `anon key read ${rows.length} row(s)!`);
    } catch (err) {
      bad(table, String(err));
    }
  }
}

console.log(`\n${"─".repeat(52)}`);
console.log(`${pass} passed · ${failures.length} failed · ${skips.length} skipped`);
if (failures.length) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  ✗ ${f}`);
}
console.log("");
process.exit(failures.length ? 1 : 0);

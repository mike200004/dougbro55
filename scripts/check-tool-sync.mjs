/**
 * Guard against voice-assistant tool drift.
 *
 * The tool contract lives in TWO hand-maintained places:
 *   - lib/tools/index.ts  (`toolSpecs`) — what the webhook can actually EXECUTE
 *   - scripts/update-vapi.mjs           — what gets DECLARED to Vapi
 * If they diverge, the assistant either calls a tool that doesn't exist (the
 * call fails mid-conversation) or never learns about one that does (the
 * feature is silently missing on the phone). Nothing else catches this: it
 * type-checks fine, builds fine, and only shows up on a live call.
 *
 * This is the same bug class that took PDF upload down (a pinned pdf.js worker
 * version drifting from the installed package), so it gets the same treatment:
 * fail the build, loudly, before it ships.
 *
 * Runs offline (no network) via the `prebuild` npm script. The live
 * code-vs-Vapi comparison lives in scripts/smoke-prod.mjs.
 */
import { readFileSync } from "node:fs";

function fail(msg, detail) {
  console.error(`[tool-sync] ${msg}`);
  if (detail) console.error(detail);
  process.exit(1);
}

// --- what the executor implements -----------------------------------------
const ts = readFileSync(new URL("../lib/tools/index.ts", import.meta.url), "utf8");
const specsStart = ts.indexOf("export const toolSpecs");
if (specsStart === -1) fail("Could not find `export const toolSpecs` in lib/tools/index.ts — update this checker.");
const specsBlock = ts.slice(specsStart, ts.indexOf("\n];", specsStart));
const executor = [...specsBlock.matchAll(/^ {4}name: "([a-z_]+)"/gm)].map((m) => m[1]);
if (!executor.length) fail("Parsed zero tools from lib/tools/index.ts — the checker's parsing is stale.");

// --- what we declare to Vapi ----------------------------------------------
const push = readFileSync(new URL("./update-vapi.mjs", import.meta.url), "utf8");
const declared = [...push.matchAll(/fn\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
if (!declared.length) fail("Parsed zero tools from scripts/update-vapi.mjs — the checker's parsing is stale.");

const a = new Set(executor);
const b = new Set(declared);
const missingFromVapi = executor.filter((t) => !b.has(t));
const missingFromExecutor = declared.filter((t) => !a.has(t));

if (missingFromVapi.length || missingFromExecutor.length) {
  fail(
    "Voice tool definitions are OUT OF SYNC — fix before shipping.",
    [
      missingFromVapi.length
        ? `  Implemented in lib/tools but NOT declared in update-vapi.mjs: ${missingFromVapi.join(", ")}\n    → the phone assistant will never know these exist.`
        : "",
      missingFromExecutor.length
        ? `  Declared to Vapi but NOT implemented in lib/tools: ${missingFromExecutor.join(", ")}\n    → calling one fails mid-conversation.`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

console.log(`[tool-sync] ${executor.length} voice tools consistent between lib/tools and update-vapi.mjs`);

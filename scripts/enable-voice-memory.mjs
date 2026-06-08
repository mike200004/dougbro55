// Switch the Vapi phone number to assistant-request so each inbound call gets
// the caller's memory digest injected (per-call priming).
//
// RUN ONLY AFTER /api/voice/assistant is deployed to production — Vapi must be
// able to reach it, or inbound calls will fail.
//
//   node scripts/update-vapi.mjs        # first: push prompt with {{memoryDigest}}
//   node scripts/enable-voice-memory.mjs           # enable
//   node scripts/enable-voice-memory.mjs --rollback  # revert to static assistant
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const KEY = env.VAPI_PRIVATE_KEY;
const PHONE_ID = "c4bc2d98-b6e9-462a-bf45-26d95273402d";
const ASSISTANT_ID = "8e46aebd-e589-4d6f-a614-7e2dfdfc621a";
const SITE = env.NEXT_PUBLIC_SITE_URL || "https://dougbro55.vercel.app";
const rollback = process.argv.includes("--rollback");

const body = rollback
  ? { assistantId: ASSISTANT_ID, server: null }
  : {
      assistantId: null,
      server: {
        url: `${SITE}/api/voice/assistant`,
        ...(env.VAPI_SERVER_SECRET ? { secret: env.VAPI_SERVER_SECRET } : {}),
      },
    };

const res = await fetch(`https://api.vapi.ai/phone-number/${PHONE_ID}`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const json = await res.json();
console.log(rollback ? "ROLLBACK" : "ENABLE", res.status);
console.log("  assistantId:", json.assistantId ?? null);
console.log("  server.url :", json.server?.url ?? null);

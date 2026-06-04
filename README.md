# Dougbro55

A personal home base for a real estate agent — clients, documents, and an AI
assistant that fills out and files official Connecticut forms. Built so the same
"brain" can later be driven by a phone call (Vapi) or text (Twilio).

## What's here (Phase 1 — web foundation)

- **Dashboard** — greeting, one-click new documents, recent docs, clients.
- **Document engine** — fills three flat, legally-official CT PDFs by overlaying
  typed values at mapped coordinates (the original form is preserved, not recreated):
  1. Exclusive Right to Represent Buyer Agreement
  2. Purchase Agreement (SmartMLS)
  3. Dual Agency Consent Agreement
- **AI assistant** — a Claude tool-use loop that can create clients, create/fill
  documents conversationally, and file them. Exposed as a web chat now; the same
  tool layer is reused by voice/SMS in Phase 2.
- **Settings** — your agent profile auto-fills the broker/agency side of every form.

## Tech stack

- Next.js 15 (App Router) + React 19 + TypeScript
- [pdf-lib](https://pdf-lib.js.org) for PDF filling (Node runtime; Vercel-friendly)
- [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) for the assistant
- Supabase for persistence (with a local-file fallback for dev)

## Getting started

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY to enable the assistant
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without Supabase env vars the
app stores data in a local `.data/store.json` file, so it works immediately.

## Architecture

```
app/
  page.tsx                      Dashboard
  documents/[id]/               Document editor (form + PDF download)
  assistant/                    AI chat UI
  settings/                     Agent profile
  api/chat/                     Claude tool-use loop (the AI brain)
  api/documents/[id]/pdf/       Generates the filled PDF on demand
  actions.ts                    Server actions (profile/client/document writes)
lib/
  templates/                    Field schemas + coordinate maps per form
  pdf/fill.ts                   pdf-lib overlay engine
  tools/                        AI tool definitions + handlers (shared seam)
  db.ts                         Storage (Supabase or local-file fallback)
  anthropic.ts                  Claude client + system prompt
templates/*.pdf                 The three source forms
supabase/migrations/            DB schema (apply when the project is provisioned)
```

The **AI tool layer** (`lib/tools`) is the integration seam: the web chat calls it
today; the planned Vapi voice webhook and Twilio SMS webhook will call the same
tools, so adding voice/SMS is not a rewrite.

## Supabase setup

`supabase/migrations/0001_init.sql` creates `agent_profile`, `clients`, and
`documents`. Apply it once a project exists (Supabase MCP `apply_migration` or
`supabase db push`), then set the `NEXT_PUBLIC_SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` env vars — the app switches from the local file store
to Supabase automatically.

## Roadmap

- [x] Welcome page
- [x] Agent dashboard + profile
- [x] Document engine for the 3 CT forms
- [x] Web AI assistant (create/fill/file documents)
- [ ] Vapi voice assistant (call a number, fill a form hands-free)
- [ ] Twilio SMS assistant
- [ ] Document delivery (email / e-signature)

## Dev notes

`scripts/test-fill.mjs` renders each template with sample data to `/tmp/fill-test`
for eyeballing coordinate placement: `node scripts/test-fill.mjs`.

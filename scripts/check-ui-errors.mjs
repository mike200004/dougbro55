/**
 * Build-time guards against the UI failure classes that keep costing us
 * outages. Same shape as copy-pdf-worker.mjs and check-tool-sync.mjs: a plain
 * Node script wired into `prebuild`, so it runs locally AND on Vercel and
 * fails the build rather than shipping the bug.
 *
 * Rules:
 *   R1  lib/**: a Supabase result destructured as `{ data }` without `error`.
 *       Swallowing the error turns a failed read into "you have no data" —
 *       an empty dashboard that looks like the account was wiped, or a paying
 *       customer downgraded to "expired".
 *   R4  "use client" files: an async function that sets a busy flag but has
 *       no `finally` — the button can stay disabled forever with no message.
 *   R7  app/global-error.tsx must exist, or a throw in the root layout renders
 *       an unstyled browser error page with no way back.
 *
 * Escape hatch: put `// ui-error-ok: <reason>` on the offending line (or the
 * line above) when a violation is genuinely intentional.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const problems = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

// The escape-hatch marker may sit on the line itself or in a short comment
// block just above it.
const allowed = (lines, i) =>
  [0, 1, 2, 3].some((back) => /ui-error-ok:/.test(lines[i - back] ?? ""));

// ---- R1: swallowed Supabase errors in lib/ --------------------------------
for (const file of existsSync(join(ROOT, "lib")) ? walk(join(ROOT, "lib")) : []) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    // `const { data } = await admin()…` / `const { data: rows } = await …`
    const destructure = /const\s*\{\s*data(\s*:\s*\w+)?\s*\}\s*=\s*await\b/.test(line);
    if (!destructure) return;
    // Only care when it's a Supabase call (this line or the next few).
    const context = lines.slice(i, i + 6).join("\n");
    if (!/admin\(\)|\.storage\.|supabase/i.test(context)) return;
    if (allowed(lines, i)) return;
    problems.push(
      `${relative(ROOT, file)}:${i + 1}  R1 destructures { data } without { error } from a Supabase call\n` +
        `      ${line.trim()}\n` +
        `      → a read failure becomes empty/null data and the UI silently lies. Destructure error and throw.`,
    );
  });
}

// ---- R4: client busy flags with no finally --------------------------------
for (const file of existsSync(join(ROOT, "app")) ? walk(join(ROOT, "app")) : []) {
  const src = readFileSync(file, "utf8");
  if (!/^\s*["']use client["']/m.test(src.split("\n").slice(0, 3).join("\n"))) continue;
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    // A line that turns a busy/loading flag on.
    if (!/\bset(Busy|Saving|Loading|Pending|Working)\w*\(\s*true\s*\)/i.test(line)) return;
    if (allowed(lines, i)) return;
    // Look ahead within the enclosing handler. Either a `finally` or a
    // `catch` that can reset the flag is acceptable — what we're hunting is a
    // handler with NO error handling at all, where a rejection strands the
    // control forever.
    const window = lines.slice(i, i + 60).join("\n");
    if (/\bfinally\s*\{/.test(window) || /\bcatch\s*(\(|\{)/.test(window)) return;
    // A synchronous handler that never awaits can't wedge.
    if (!/\bawait\b/.test(window)) return;
    problems.push(
      `${relative(ROOT, file)}:${i + 1}  R4 sets a busy flag before an await with no finally\n` +
        `      ${line.trim()}\n` +
        `      → if the await rejects the control stays disabled forever with no message. Use try/catch/finally.`,
    );
  });
}

// ---- R7: global error boundary exists -------------------------------------
if (!existsSync(join(ROOT, "app", "global-error.tsx"))) {
  problems.push(
    "app/global-error.tsx  R7 missing\n" +
      "      → an error thrown in the root layout renders an unstyled browser page with no way back.",
  );
}

if (problems.length) {
  console.error(`\n[ui-errors] ${problems.length} UI failure-mode violation(s):\n`);
  for (const p of problems) console.error("  " + p + "\n");
  console.error(
    "Each of these has produced a real customer-visible failure in this product.\n" +
      "Fix it, or annotate the line with `// ui-error-ok: <reason>` if it is genuinely intentional.\n",
  );
  process.exit(1);
}

console.log("[ui-errors] no swallowed DB errors, no unguarded busy flags, global boundary present");

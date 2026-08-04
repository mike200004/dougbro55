/**
 * Copy the pdf.js worker out of the INSTALLED pdfjs-dist into public/ so the
 * upload page can load it from our own origin.
 *
 * Why this exists: pdf.js refuses to run when the API and worker versions
 * differ ("The API version X does not match the Worker version Y"), which
 * fails EVERY PDF upload at the first getDocument() call. The worker used to
 * be a hardcoded CDN URL with a pinned version, so bumping pdfjs-dist
 * silently broke uploads. Copying from node_modules at build time makes the
 * two versions the same file by construction — they cannot drift.
 *
 * Runs automatically via the `prebuild` npm script (npm runs prebuild before
 * build, locally and on Vercel). Fails the build loudly rather than shipping
 * a deployment whose upload page is dead.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

let pkgPath;
try {
  pkgPath = require.resolve("pdfjs-dist/package.json");
} catch {
  console.error("[pdf-worker] pdfjs-dist is not installed — cannot stage the PDF worker.");
  process.exit(1);
}

const version = JSON.parse(readFileSync(pkgPath, "utf8")).version;
const src = join(dirname(pkgPath), "build", "pdf.worker.min.mjs");
if (!existsSync(src)) {
  console.error(`[pdf-worker] Expected worker at ${src} — pdfjs-dist layout changed. Upload would break; failing the build.`);
  process.exit(1);
}

const outDir = join(process.cwd(), "public");
mkdirSync(outDir, { recursive: true });
const dest = join(outDir, "pdf.worker.min.mjs");
copyFileSync(src, dest);

// The worker embeds its own version; prove the copy matches what the app's
// API build will report at runtime.
const copied = readFileSync(dest, "utf8");
if (!copied.includes(`"${version}"`)) {
  console.error(`[pdf-worker] Copied worker does not report version ${version}. Refusing to ship a mismatched worker.`);
  process.exit(1);
}

console.log(`[pdf-worker] staged public/pdf.worker.min.mjs (pdfjs-dist ${version})`);

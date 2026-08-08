import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/ratelimit";

/**
 * Client-side error sink.
 *
 * Browser errors are invisible to us: Vercel captures server logs only, so a
 * feature can be 100% broken for every user while production looks perfectly
 * healthy. That is exactly how the pdf.js worker outage survived — every
 * upload threw in the browser, the UI showed a friendly message, and nothing
 * anywhere recorded it. This endpoint puts those errors into the server logs,
 * where they surface in Vercel's runtime-error view.
 *
 * Deliberately tiny and permissive: it must never break the page that is
 * already failing. Always 204, even on bad input.
 */
export const dynamic = "force-dynamic";

const MAX = 600; // chars kept per field — enough to identify, not to hoard

export async function POST(req: NextRequest) {
  try {
    // One noisy tab must not flood the logs (or the log bill).
    if (!rateLimit(`clienterr:${clientIp(req)}`, 20, 60_000)) {
      return new NextResponse(null, { status: 204 });
    }
    const body = (await req.json().catch(() => null)) as
      | { context?: unknown; message?: unknown; stack?: unknown; url?: unknown }
      | null;
    if (!body) return new NextResponse(null, { status: 204 });

    const str = (v: unknown) => (typeof v === "string" ? v.slice(0, MAX) : "");
    const context = str(body.context) || "unknown";
    const message = str(body.message);
    if (!message) return new NextResponse(null, { status: 204 });

    // console.error so it lands in Vercel's runtime errors, not just logs.
    console.error(
      `[client-error] ${context}: ${message}` +
        `${str(body.url) ? ` @ ${str(body.url)}` : ""}` +
        `${str(body.stack) ? `\n${str(body.stack)}` : ""}`,
    );
  } catch {
    // Reporting must never itself throw.
  }
  return new NextResponse(null, { status: 204 });
}

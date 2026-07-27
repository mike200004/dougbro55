import { NextRequest, NextResponse } from "next/server";
import { getDocumentById } from "@/lib/db";
import { verifyShareToken } from "@/lib/share";
import { renderDocument, TemplateRetiredError } from "@/lib/pdf/fill";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** Public, token-authorized filled-PDF link (what recipients receive). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!rateLimit(`share:${clientIp(_req)}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const { token } = await params;
  const docId = verifyShareToken(token);
  if (!docId) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  const doc = await getDocumentById(docId);
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  let rendered;
  try {
    rendered = await renderDocument(doc);
  } catch (err) {
    if (err instanceof TemplateRetiredError) {
      return NextResponse.json({ error: "This form has been retired and is no longer available." }, { status: 410 });
    }
    throw err;
  }

  return new NextResponse(Buffer.from(rendered.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${rendered.filename}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

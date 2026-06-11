import { NextRequest, NextResponse } from "next/server";
import { getDocumentById } from "@/lib/db";
import { verifyShareToken } from "@/lib/share";
import { renderDocument } from "@/lib/pdf/fill";
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

  const { bytes, filename } = await renderDocument(doc);

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getDocumentById, getProfile } from "@/lib/db";
import { verifyShareToken } from "@/lib/share";
import { fillDocument } from "@/lib/pdf/fill";
import { getTemplate } from "@/lib/templates";

export const runtime = "nodejs";

/** Public, token-authorized filled-PDF link (what recipients receive). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const docId = verifyShareToken(token);
  if (!docId) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  const doc = await getDocumentById(docId);
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const profile = await getProfile(doc.account_id);
  const bytes = await fillDocument(doc.type, doc.fields, profile);
  const tpl = getTemplate(doc.type);
  const safeTitle = (doc.title || tpl.shortName).replace(/[^a-z0-9]+/gi, "-");

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeTitle}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

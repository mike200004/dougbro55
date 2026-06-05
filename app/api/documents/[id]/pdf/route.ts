import { NextRequest, NextResponse } from "next/server";
import { getDocument, getProfile } from "@/lib/db";
import { getAccount } from "@/lib/auth";
import { fillDocument } from "@/lib/pdf/fill";
import { getTemplate } from "@/lib/templates";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const account = await getAccount();
  if (!account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const doc = await getDocument(account.accountId, id);
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const profile = await getProfile(account.accountId);
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

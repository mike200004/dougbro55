import { NextRequest, NextResponse } from "next/server";
import { getDocument } from "@/lib/db";
import { getAccount } from "@/lib/auth";
import { renderDocument, TemplateRetiredError } from "@/lib/pdf/fill";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const account = await getAccount();
  if (!account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (account.status !== "active") {
    return NextResponse.json({ error: "Account pending approval" }, { status: 403 });
  }

  const { id } = await params;
  const doc = await getDocument(account.accountId, id);
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  let rendered;
  try {
    rendered = await renderDocument(doc);
  } catch (err) {
    if (err instanceof TemplateRetiredError) {
      return NextResponse.json(
        { error: "This form has been retired — its details are preserved, but the PDF can no longer be generated." },
        { status: 410 },
      );
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

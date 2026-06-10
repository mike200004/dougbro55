import { NextRequest, NextResponse } from "next/server";
import { verifySignToken } from "@/lib/share";
import {
  getDocumentById,
  getProfile,
  getSignatureRequestById,
  updateSignatureRequest,
} from "@/lib/db";
import { renderDocument, stampSignaturePage } from "@/lib/pdf/fill";
import { uploadSignedFile } from "@/lib/storage";
import { sendEmail, emailConfigured } from "@/lib/email";
import { sendSms } from "@/lib/twilio";
import { logActivity } from "@/lib/activity";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const CONSENT_TEXT =
  "By signing, I agree that my electronic signature is the legal equivalent of my handwritten signature, that I consent to conduct this transaction electronically under the U.S. ESIGN Act and applicable state law (including UETA), and that I have reviewed the document presented to me.";

async function resolveRequest(token: string) {
  const id = verifySignToken(token);
  if (!id) return null;
  const reqRow = await getSignatureRequestById(id);
  if (!reqRow) return null;
  const doc = await getDocumentById(reqRow.document_id);
  if (!doc) return null;
  return { reqRow, doc };
}

/** GET ?pdf=1 → current PDF inline; otherwise JSON status for the sign page. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!rateLimit(`sign:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const { token } = await params;
  const resolved = await resolveRequest(token);
  if (!resolved) return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  const { reqRow, doc } = resolved;

  if (req.nextUrl.searchParams.get("pdf")) {
    const { bytes, filename } = await renderDocument(doc);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({
    status: reqRow.status,
    signer_name: reqRow.signer_name,
    document_title: doc.title || "Document",
    consent_text: CONSENT_TEXT,
  });
}

/** POST { action: "sign"|"decline", name, signaturePng?, consent } */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!rateLimit(`sign:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const { token } = await params;
  const resolved = await resolveRequest(token);
  if (!resolved) return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  const { reqRow, doc } = resolved;

  if (reqRow.status !== "pending") {
    return NextResponse.json({ error: `This request was already ${reqRow.status}.` }, { status: 409 });
  }

  let body: { action?: string; name?: string; signaturePng?: string; consent?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const agentProfile = await getProfile(doc.account_id);

  if (body.action === "decline") {
    await updateSignatureRequest(reqRow.id, {
      status: "declined",
      audit: { ...reqRow.audit, declined_at: new Date().toISOString(), ip: clientIp(req) },
    });
    await logActivity(doc.account_id, "signature_declined", `${reqRow.signer_name || "The signer"} declined to sign “${doc.title}”.`);
    if (agentProfile?.email && emailConfigured()) {
      await sendEmail({
        to: agentProfile.email,
        subject: `Declined: ${doc.title}`,
        html: `<p>${reqRow.signer_name || "Your signer"} declined to sign “${doc.title}”.</p><p>— Pheme</p>`,
      });
    }
    return NextResponse.json({ ok: true, status: "declined" });
  }

  const name = (body.name || reqRow.signer_name || "").trim();
  if (!name) return NextResponse.json({ error: "Type your full legal name to sign." }, { status: 400 });
  if (!body.consent) {
    return NextResponse.json({ error: "You must agree to sign electronically." }, { status: 400 });
  }

  // Render the current document of record and append the certificate page.
  const { bytes } = await renderDocument(doc);
  const signedAtIso = new Date().toISOString();
  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent") || "unknown";
  const signedBytes = await stampSignaturePage(bytes, {
    signerName: name,
    signerContact: reqRow.signer_email || reqRow.signer_phone || "—",
    documentTitle: doc.title || "Document",
    signedAtIso,
    ip,
    userAgent,
    consentText: CONSENT_TEXT,
    signaturePngDataUrl: body.signaturePng || null,
  });

  const signedPath = `${doc.account_id}/signed/${reqRow.id}.pdf`;
  await uploadSignedFile(signedPath, signedBytes);
  await updateSignatureRequest(reqRow.id, {
    status: "signed",
    signer_name: name,
    signed_path: signedPath,
    signed_at: signedAtIso,
    audit: {
      ...reqRow.audit,
      consented_at: signedAtIso,
      ip,
      user_agent: userAgent,
      consent_text: CONSENT_TEXT,
    },
  });
  await logActivity(doc.account_id, "signature_signed", `${name} signed “${doc.title}”.`);

  // Deliver copies: signer (email if we have it) + the agent.
  const attachment = {
    filename: `${(doc.title || "document").replace(/[^a-z0-9]+/gi, "-")}-signed.pdf`,
    contentBase64: Buffer.from(signedBytes).toString("base64"),
  };
  if (emailConfigured()) {
    if (reqRow.signer_email) {
      await sendEmail({
        to: reqRow.signer_email,
        subject: `Signed copy: ${doc.title}`,
        html: `<p>${name}, here’s your signed copy of “${doc.title}”, attached.</p><p>— Pheme</p>`,
        attachment,
      });
    }
    if (agentProfile?.email) {
      await sendEmail({
        to: agentProfile.email,
        subject: `✓ Signed: ${doc.title}`,
        html: `<p>${name} just signed “${doc.title}”. The executed copy is attached and on your dashboard.</p><p>— Pheme</p>`,
        attachment,
      });
    }
  }
  if (agentProfile?.phone) {
    await sendSms(agentProfile.phone, `Pheme: ${name} just signed “${doc.title}”. The executed copy is on your dashboard.`);
  }

  return NextResponse.json({ ok: true, status: "signed" });
}

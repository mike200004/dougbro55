import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocument, getFormTemplate, getProfile, listSignatureRequests } from "@/lib/db";
import { getTemplate, userFields } from "@/lib/templates";
import { makeSignToken } from "@/lib/share";
import { requireAccount } from "@/lib/auth";
import type { DocType } from "@/lib/types";
import DocumentEditor from "./DocumentEditor";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://pheme.deals";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { accountId } = await requireAccount();
  const [doc, profile, sigRequests] = await Promise.all([
    getDocument(accountId, id),
    getProfile(accountId),
    listSignatureRequests(accountId, id).catch(() => []),
  ]);
  if (!doc) notFound();

  const signedReq = sigRequests.find((r) => r.status === "signed");
  const signatures = sigRequests
    .filter((r) => r.status === "pending" || r.status === "signed")
    .map((r) => ({
      id: r.id,
      signer: r.signer_name,
      contact: r.signer_email || r.signer_phone || "",
      status: r.status,
      created_at: r.created_at,
      signUrl: r.status === "pending" ? `${SITE}/sign/${makeSignToken(r.id)}` : null,
    }));

  let heading: string;
  let sub: string;
  let isUploaded = false;
  let fields: {
    key: string;
    label: string;
    type: string;
    required: boolean;
    hint: string | null;
    options?: string[] | null;
    section?: string | null;
    pairedWith?: string[] | null;
  }[];

  if (doc.template_id) {
    isUploaded = true;
    const ft = await getFormTemplate(accountId, doc.template_id);
    heading = ft?.name ?? doc.title ?? "Uploaded form";
    sub = "Your uploaded form. Fill the fields below, then download or send it.";
    fields = (ft?.fields ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: false,
      hint: null,
      options: f.options ?? null,
      section: f.placement ? `Page ${f.placement.page + 1}` : null,
    }));
  } else {
    const tpl = getTemplate(doc.type as DocType);
    heading = tpl.name;
    sub = tpl.description;
    fields = userFields(doc.type as DocType).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: Boolean(f.required),
      hint: f.hint ?? null,
      section: f.section ?? null,
      pairedWith: f.pairedWith ?? null,
    }));
  }

  return (
    <div className="stack">
      <div>
        <Link href="/" className="backlink">← Dashboard</Link>
        <h1 className="pageTitle" style={{ marginTop: 10 }}>{heading}</h1>
        <p className="pageSub">{sub}</p>
      </div>

      {signedReq && (
        <div className="notice">
          Signed by <strong>{signedReq.signer_name}</strong> on{" "}
          {new Date(signedReq.signed_at || signedReq.created_at).toLocaleDateString()} — this
          document is locked as the executed copy.{" "}
          <a href={`/api/documents/${doc.id}/pdf`} target="_blank" rel="noopener noreferrer">
            Download the signed PDF
          </a>
          . Need changes? Duplicate it from <Link href="/documents">Documents</Link>.
        </div>
      )}

      {!isUploaded && !profile && (
        <div className="notice">
          No agent profile set — the broker/agency section will be blank. Add it in{" "}
          <Link href="/settings">Settings</Link>
          .
        </div>
      )}

      <DocumentEditor
        docId={doc.id}
        title={doc.title}
        status={doc.status}
        fields={fields}
        values={doc.fields}
        locked={Boolean(signedReq)}
        signatures={signatures}
      />
    </div>
  );
}

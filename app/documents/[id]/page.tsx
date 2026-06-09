import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocument, getFormTemplate, getProfile } from "@/lib/db";
import { getTemplate, userFields } from "@/lib/templates";
import { requireAccount } from "@/lib/auth";
import type { DocType } from "@/lib/types";
import DocumentEditor from "./DocumentEditor";

export const dynamic = "force-dynamic";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { accountId } = await requireAccount();
  const [doc, profile] = await Promise.all([
    getDocument(accountId, id),
    getProfile(accountId),
  ]);
  if (!doc) notFound();

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
    }));
  }

  return (
    <div className="stack">
      <div>
        <Link href="/" className="backlink">← Dashboard</Link>
        <h1 className="pageTitle" style={{ marginTop: 10 }}>{heading}</h1>
        <p className="pageSub">{sub}</p>
      </div>

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
      />
    </div>
  );
}

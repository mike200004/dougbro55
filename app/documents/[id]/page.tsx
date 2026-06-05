import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocument, getProfile } from "@/lib/db";
import { getTemplate, userFields } from "@/lib/templates";
import { requireAccount } from "@/lib/auth";
import DocumentEditor from "./DocumentEditor";

export const dynamic = "force-dynamic";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await requireAccount();
  const [doc, profile] = await Promise.all([
    getDocument(userId, id),
    getProfile(userId),
  ]);
  if (!doc) notFound();

  const tpl = getTemplate(doc.type);
  const fields = userFields(doc.type).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    required: Boolean(f.required),
    hint: f.hint ?? null,
  }));

  return (
    <div className="stack">
      <div>
        <Link href="/" className="backlink">← Dashboard</Link>
        <h1 className="pageTitle" style={{ marginTop: 10 }}>{tpl.name}</h1>
        <p className="pageSub">{tpl.description}</p>
      </div>

      {!profile && (
        <div className="notice">
          No agent profile set — the broker/agency section will be blank. Add it in{" "}
          <Link href="/settings" style={{ color: "#ffd87a", textDecoration: "underline" }}>
            Settings
          </Link>
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

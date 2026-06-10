import Link from "next/link";
import { listDocuments, listSignatureRequests } from "@/lib/db";
import { getTemplate } from "@/lib/templates";
import { requireAccount } from "@/lib/auth";
import DocumentRowActions from "./DocumentRowActions";

export const dynamic = "force-dynamic";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "completed", label: "Filed" },
  { id: "awaiting", label: "Awaiting signature" },
  { id: "signed", label: "Signed" },
  { id: "archived", label: "Archived" },
] as const;

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string }>;
}) {
  const { accountId } = await requireAccount();
  const { q = "", f = "all" } = await searchParams;

  const [docs, sigs] = await Promise.all([
    listDocuments(accountId, { includeArchived: true }),
    listSignatureRequests(accountId),
  ]);

  const sigState = new Map<string, "awaiting" | "signed">();
  for (const s of sigs) {
    if (s.status === "signed" && !sigState.has(s.document_id)) sigState.set(s.document_id, "signed");
    if (s.status === "pending") sigState.set(s.document_id, "awaiting");
  }

  const needle = q.toLowerCase().trim();
  const filtered = docs.filter((d) => {
    if (needle && !(d.title || "").toLowerCase().includes(needle)) return false;
    switch (f) {
      case "archived":
        return d.archived;
      case "draft":
        return !d.archived && d.status === "draft";
      case "completed":
        return !d.archived && d.status === "completed";
      case "awaiting":
        return !d.archived && sigState.get(d.id) === "awaiting";
      case "signed":
        return !d.archived && sigState.get(d.id) === "signed";
      default:
        return !d.archived;
    }
  });

  return (
    <div className="stack">
      <div>
        <h1 className="pageTitle">Documents</h1>
        <p className="pageSub">Everything you’ve started, filed, sent, and signed.</p>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <form method="GET" className="btnRow" style={{ alignItems: "center" }}>
          <input className="input" style={{ flex: "1 1 220px" }} name="q" defaultValue={q} placeholder="Search by title…" />
          <input type="hidden" name="f" value={f} />
          <button className="btn" type="submit">Search</button>
        </form>
        <div className="btnRow" style={{ marginTop: 12 }}>
          {FILTERS.map((tab) => (
            <Link
              key={tab.id}
              href={`/documents?f=${tab.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`badge${f === tab.id ? " badgeDraft" : ""}`}
              style={{ textDecoration: "none" }}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <div>
          {filtered.map((doc) => {
            const kind = doc.type === "uploaded" ? "Uploaded form" : getTemplate(doc.type).shortName;
            const sig = sigState.get(doc.id);
            return (
              <div key={doc.id} className="row">
                <Link href={`/documents/${doc.id}`} style={{ textDecoration: "none", flex: 1, minWidth: 0 }}>
                  <div className="rowMain">{doc.title || kind}</div>
                  <div className="rowSub">
                    {kind} · updated {new Date(doc.updated_at).toLocaleDateString()}
                  </div>
                </Link>
                <span className="btnRow" style={{ flexWrap: "nowrap", alignItems: "center" }}>
                  {sig === "signed" && <span className="badge badgeOk">Signed</span>}
                  {sig === "awaiting" && <span className="badge">Awaiting signature</span>}
                  <span className={`badge ${doc.status === "completed" ? "badgeOk" : "badgeDraft"}`}>
                    {doc.status === "completed" ? "Filed" : "Draft"}
                  </span>
                  <DocumentRowActions docId={doc.id} archived={doc.archived} />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

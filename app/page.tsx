import Link from "next/link";
import { getProfile, listClients, listDocuments, memberNames } from "@/lib/db";
import { templateList, getTemplate } from "@/lib/templates";
import { requireAccount } from "@/lib/auth";
import { newDocumentAction } from "./actions";
import AddClient from "./AddClient";

export const dynamic = "force-dynamic";

function greeting(name: string | undefined) {
  const who = name?.split(" ")[0];
  return who ? `Welcome back, ${who}` : "Welcome to your portal";
}

export default async function Dashboard() {
  const account = await requireAccount();
  const { accountId } = account;
  const [profile, clients, documents, names] = await Promise.all([
    getProfile(accountId),
    listClients(accountId),
    listDocuments(accountId),
    memberNames(accountId),
  ]);

  return (
    <div className="stack">
      <header>
        <h1 className="pageTitle">{greeting(account.name || profile?.agent_name)}</h1>
        <p className="pageSub">
          Your real estate home base. Start a document below, or talk to your{" "}
          <Link href="/assistant" style={{ color: "var(--brand-soft)" }}>
            AI assistant
          </Link>{" "}
          to fill one out hands-free.
        </p>
      </header>

      <section>
        <h2 className="sectionTitle">New document</h2>
        <div className="grid">
          {templateList.map((tpl) => (
            <form key={tpl.id} action={newDocumentAction.bind(null, tpl.id)}>
              <button
                type="submit"
                className="card"
                style={{
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                  color: "var(--text)",
                  font: "inherit",
                }}
              >
                <div className="cardKicker">{tpl.shortName}</div>
                <div className="cardTitle">{tpl.name}</div>
                <div className="cardBody">{tpl.description}</div>
              </button>
            </form>
          ))}
        </div>
      </section>

      <section>
        <h2 className="sectionTitle">Recent documents</h2>
        {documents.length === 0 ? (
          <p className="muted">No documents yet. Start one above or ask the assistant.</p>
        ) : (
          documents.slice(0, 8).map((doc) => {
            const tpl = getTemplate(doc.type);
            return (
              <Link key={doc.id} href={`/documents/${doc.id}`} className="row" style={{ textDecoration: "none" }}>
                <div>
                  <div className="rowMain">{doc.title || tpl.name}</div>
                  <div className="rowSub">
                    {tpl.shortName} · updated {new Date(doc.updated_at).toLocaleDateString()}
                    {doc.created_by && names[doc.created_by] ? ` · by ${names[doc.created_by]}` : ""}
                  </div>
                </div>
                <span className={`badge ${doc.status === "completed" ? "badgeOk" : "badgeDraft"}`}>
                  {doc.status === "completed" ? "Filed" : "Draft"}
                </span>
              </Link>
            );
          })
        )}
      </section>

      <section>
        <h2 className="sectionTitle">Clients</h2>
        {clients.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {clients.slice(0, 6).map((c) => (
              <div key={c.id} className="row">
                <div>
                  <div className="rowMain">{c.full_name}</div>
                  <div className="rowSub">
                    {[c.role, c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <AddClient />
      </section>

      {!profile && (
        <div className="notice">
          Tip: fill in your agent profile in{" "}
          <Link href="/settings" style={{ color: "#ffd87a", textDecoration: "underline" }}>
            Settings
          </Link>{" "}
          so the broker/agency details auto-fill on every document.
        </div>
      )}
    </div>
  );
}

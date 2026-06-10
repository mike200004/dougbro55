import Link from "next/link";
import {
  getProfile,
  listClients,
  listDocuments,
  listFormTemplates,
  listMembers,
  listSignatureRequests,
  memberNames,
} from "@/lib/db";
import { listActivity } from "@/lib/activity";
import { getPlan } from "@/lib/billing";
import { templateCategories, templateList, getTemplate } from "@/lib/templates";
import { getAccount } from "@/lib/auth";
import { newDocumentAction, startFromTemplateAction } from "./actions";
import AddClient from "./AddClient";
import Onboarding from "./Onboarding";
import TemplateActions from "./TemplateActions";
import Landing from "./Landing";

export const dynamic = "force-dynamic";

const PHEME_NUMBER = "(475) 270-3374";

function greeting(name: string | undefined) {
  const who = name?.split(" ")[0];
  return who ? `Welcome back, ${who}` : "Welcome to your portal";
}

export default async function Home() {
  const account = await getAccount();
  if (!account) return <Landing />;
  const { accountId } = account;
  const [profile, clients, documents, names, forms, members, sigs, activity, plan] =
    await Promise.all([
      getProfile(accountId),
      listClients(accountId),
      listDocuments(accountId),
      memberNames(accountId),
      listFormTemplates(accountId),
      listMembers(accountId),
      listSignatureRequests(accountId),
      listActivity(accountId, 8),
      getPlan(accountId),
    ]);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const filedThisMonth = documents.filter(
    (d) => d.status === "completed" && new Date(d.updated_at) >= monthStart,
  ).length;
  const awaitingSig = sigs.filter((s) => s.status === "pending").length;

  return (
    <div className="stack">
      <header>
        <h1 className="pageTitle">{greeting(account.name || profile?.agent_name)}</h1>
        <p className="pageSub">
          Your real estate home base. Start a document below, call{" "}
          <a href="tel:+14752703374">{PHEME_NUMBER}</a>, or talk to your{" "}
          <Link href="/assistant">AI assistant</Link> to fill one out hands-free.
        </p>
      </header>

      {plan.plan === "trial" && (
        <div className="notice">
          You’re on a free trial — {plan.daysLeft} day{plan.daysLeft === 1 ? "" : "s"} left.
          Upgrade anytime in <Link href="/settings">Settings</Link>.
        </div>
      )}
      {plan.plan === "expired" && (
        <div className="notice">
          Your trial has ended — upgrade in <Link href="/settings">Settings</Link> to keep
          filing documents.
        </div>
      )}

      <Onboarding
        phone={PHEME_NUMBER}
        hasDoc={documents.length > 0}
        hasTemplate={forms.length > 0}
        hasTeam={members.length > 1}
      />

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {[
          { n: filedThisMonth, label: "Filed this month" },
          { n: clients.length, label: "Clients remembered" },
          { n: forms.length, label: "Forms uploaded" },
          { n: awaitingSig, label: "Awaiting signature" },
        ].map((s) => (
          <div key={s.label} className="card" style={{ textAlign: "center", padding: 16 }}>
            <div className="cardTitle" style={{ fontSize: 30, margin: 0 }}>{s.n}</div>
            <div className="rowSub">{s.label}</div>
          </div>
        ))}
      </section>

      <section>
        <h2 className="sectionTitle">New document</h2>
        <p className="pageSub" style={{ marginTop: 0, marginBottom: 14, fontSize: 14 }}>
          A full library for the deal and the office — or say the word to your assistant
          and it starts one for you.
        </p>
        {templateCategories.map((cat) => {
          const docs = templateList.filter((t) => t.category === cat);
          if (docs.length === 0) return null;
          return (
            <div key={cat} style={{ marginBottom: 18 }}>
              <div className="cardKicker" style={{ marginBottom: 10 }}>{cat}</div>
              <div className="grid">
                {docs.map((tpl) => (
                  <form key={tpl.id} action={newDocumentAction.bind(null, tpl.id)}>
                    <button
                      type="submit"
                      className="card"
                      style={{
                        width: "100%",
                        height: "100%",
                        textAlign: "left",
                        cursor: "pointer",
                        color: "var(--text)",
                        font: "inherit",
                      }}
                    >
                      <div className="cardKicker">{tpl.shortName}</div>
                      <div className="cardTitle" style={{ fontSize: 19 }}>{tpl.name}</div>
                      <div className="cardBody">{tpl.description}</div>
                    </button>
                  </form>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section>
        <h2 className="sectionTitle">Your forms</h2>
        <p className="pageSub" style={{ marginTop: 0, marginBottom: 14, fontSize: 14 }}>
          Upload a fillable PDF — a SmartMLS form, a brokerage document, a disclosure — and
          Pheme detects its fields so you can fill it by web, voice, or text. Uploaded forms
          are saved here to reuse.
        </p>
        {forms.length > 0 && (
          <div className="grid" style={{ marginBottom: 16 }}>
            {forms.map((f) => (
              <div key={f.id} className="card">
                <form action={startFromTemplateAction.bind(null, f.id)}>
                  <button
                    type="submit"
                    style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
                  >
                    <div className="cardKicker">Uploaded form</div>
                    <div className="cardTitle">{f.name}</div>
                    <div className="cardBody">{f.fields.length} fields · start a copy</div>
                  </button>
                </form>
                <div style={{ marginTop: 10 }}>
                  <TemplateActions templateId={f.id} name={f.name} />
                </div>
              </div>
            ))}
          </div>
        )}
        <Link href="/forms/new" className="btn">+ Upload a form</Link>
      </section>

      <section>
        <h2 className="sectionTitle">
          Recent documents · <Link href="/documents" style={{ fontWeight: 700 }}>view all</Link>
        </h2>
        {documents.length === 0 ? (
          <p className="muted">No documents yet. Start one above or ask the assistant.</p>
        ) : (
          documents.slice(0, 8).map((doc) => {
            const kind = doc.type === "uploaded" ? "Uploaded form" : getTemplate(doc.type).shortName;
            const fallback = doc.type === "uploaded" ? "Uploaded form" : getTemplate(doc.type).name;
            return (
              <Link key={doc.id} href={`/documents/${doc.id}`} className="row" style={{ textDecoration: "none" }}>
                <div>
                  <div className="rowMain">{doc.title || fallback}</div>
                  <div className="rowSub">
                    {kind} · updated {new Date(doc.updated_at).toLocaleDateString()}
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
        <h2 className="sectionTitle">
          Clients · <Link href="/clients" style={{ fontWeight: 700 }}>view all</Link>
        </h2>
        {clients.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {clients.slice(0, 6).map((c) => (
              <Link key={c.id} href={`/clients/${c.id}`} className="row" style={{ textDecoration: "none" }}>
                <div>
                  <div className="rowMain">
                    {c.secondary_name ? `${c.full_name} & ${c.secondary_name}` : c.full_name}
                  </div>
                  <div className="rowSub">
                    {[c.role, c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {c.preferences && <div className="rowNote">Remembers: {c.preferences}</div>}
                </div>
              </Link>
            ))}
          </div>
        )}
        <AddClient />
      </section>

      {activity.length > 0 && (
        <section>
          <h2 className="sectionTitle">Recent activity</h2>
          {activity.map((a) => (
            <div key={a.id} className="row" style={{ padding: "10px 18px" }}>
              <div>
                <div style={{ fontSize: 14 }}>{a.message}</div>
                <div className="rowSub">
                  {new Date(a.created_at).toLocaleString()}
                  {a.actor_id && names[a.actor_id] ? ` · ${names[a.actor_id]}` : ""}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {!profile && (
        <div className="notice">
          Tip: fill in your agent profile in <Link href="/settings">Settings</Link>{" "}
          so the broker/agency details auto-fill on every document.
        </div>
      )}
    </div>
  );
}

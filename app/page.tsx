import Link from "next/link";
import { redirect } from "next/navigation";
import {
  countClients,
  countDocuments,
  getProfile,
  listClients,
  listDocuments,
  listFormTemplates,
  listMembers,
  listSignatureRequests,
  memberNames,
} from "@/lib/db";
import { listActivity } from "@/lib/activity";
import { templateCategories, templateList, docTypeLabel } from "@/lib/templates";
import { getPlanState, getVoiceUsage } from "@/lib/billing";
import { getAccount } from "@/lib/auth";
import { newDocumentAction, startFromTemplateAction } from "./actions";
import AddClient from "./AddClient";
import Onboarding from "./Onboarding";
import TemplateActions from "./TemplateActions";
import TileButton from "./TileButton";
import Landing from "./Landing";

export const dynamic = "force-dynamic";

const PHEME_NUMBER = "(475) 270-3374";

function greeting(name: string | undefined) {
  const who = name?.split(" ")[0];
  return who ? `Welcome back, ${who}` : "Welcome to your portal";
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ uploaded?: string; formError?: string }>;
}) {
  const account = await getAccount();
  if (!account) return <Landing />;
  if (account.status !== "active") redirect("/pending");
  const { accountId } = account;
  const params = await searchParams;
  const uploaded = params?.uploaded;
  const formError = params?.formError;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Render only what the dashboard shows (bounded lists); stat tiles use count
  // queries so the page doesn't load a tenant's whole history on every login.
  const [profile, clients, documents, names, forms, members, sigs, activity, clientCount, filedThisMonth, planState] =
    await Promise.all([
      getProfile(accountId),
      listClients(accountId, { limit: 6 }),
      listDocuments(accountId, { limit: 8 }),
      memberNames(accountId),
      listFormTemplates(accountId),
      listMembers(accountId),
      listSignatureRequests(accountId),
      listActivity(accountId, 8),
      countClients(accountId),
      countDocuments(accountId, { status: "completed", archived: false, updatedSince: monthStart.toISOString() }),
      getPlanState(accountId).catch(() => null),
    ]);
  const trialUsage =
    planState?.plan === "trial" ? await getVoiceUsage(accountId, planState).catch(() => null) : null;

  // Count distinct documents awaiting signature, not raw request rows — a
  // document can have several pending requests, and the Documents list shows
  // one "Awaiting signature" badge per document, so this keeps the two in sync.
  const awaitingSig = new Set(
    sigs.filter((s) => s.status === "pending").map((s) => s.document_id),
  ).size;

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

      {planState?.plan === "trial" && (
        <div className="notice" role="status">
          <strong>Free trial</strong> — {planState.trialDaysLeft ?? 0} day
          {(planState.trialDaysLeft ?? 0) === 1 ? "" : "s"}
          {trialUsage
            ? ` and ${trialUsage.remainingMinutes} voice minute${trialUsage.remainingMinutes === 1 ? "" : "s"}`
            : ""}{" "}
          left. Everything else is unlimited while you try it.{" "}
          {account.role === "owner" && (
            <Link href="/settings" style={{ fontWeight: 700 }}>
              Pick a plan →
            </Link>
          )}
        </div>
      )}
      {planState && !planState.active && (
        <div className="notice" role="alert">
          <strong>Your plan isn’t active</strong> — document filing and the phone assistant are
          paused, but everything you made is safe.{" "}
          {account.role === "owner" ? (
            <Link href="/settings" style={{ fontWeight: 700 }}>
              Choose a plan to switch it back on →
            </Link>
          ) : (
            "Ask the account owner to pick a plan in Settings."
          )}
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
          { n: clientCount, label: "Clients remembered" },
          { n: forms.length, label: "Forms uploaded" },
          { n: awaitingSig, label: "Awaiting signature" },
        ].map((s) => (
          <div key={s.label} className="card" style={{ textAlign: "center", padding: 16 }}>
            <div className="cardTitle" style={{ fontSize: 30, margin: 0 }}>{s.n}</div>
            <div className="rowSub">{s.label}</div>
          </div>
        ))}
      </section>

      <section id="your-forms">
        <h2 className="sectionTitle">Your forms</h2>
        <p className="pageSub" style={{ marginTop: 0, marginBottom: 14, fontSize: 14 }}>
          Upload any PDF — fillable forms import instantly; flat or scanned ones get AI
          field detection you fine-tune once. Then fill it by web or voice, forever.
        </p>
        {uploaded && (
          <div className="notice" style={{ marginBottom: 14 }}>
            “{uploaded}” is ready — start a copy any time, or just ask for it by name on a call.
          </div>
        )}
        {formError && (
          <div className="notice" style={{ marginBottom: 14 }}>
            “{formError}” has no fillable fields, so there’s nothing to fill in yet. Delete it and
            upload the PDF again — if it isn’t a fillable form, Pheme will find the blanks for you
            and let you place them.
          </div>
        )}
        <div className="grid" style={{ marginBottom: forms.length ? 16 : 0 }}>
          <Link
            href="/forms/new"
            className="card"
            style={{ textDecoration: "none", color: "var(--text)", borderStyle: "dashed" }}
          >
            <div className="cardKicker">Upload</div>
            <div className="cardTitle" style={{ fontSize: 19 }}>+ Upload your own form</div>
            <div className="cardBody">
              Your contracts, brokerage paperwork, disclosures — bring the documents you
              actually use.
            </div>
          </Link>
          {forms.map((f) => (
            <div key={f.id} className="card">
              <form action={startFromTemplateAction.bind(null, f.id)}>
                <TileButton kicker="Uploaded form" title={f.name} body={`${f.fields.length} fields · start a copy`} unstyled />
              </form>
              <div style={{ marginTop: 10 }}>
                <TemplateActions templateId={f.id} name={f.name} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="sectionTitle">New document</h2>
        <p className="pageSub" style={{ marginTop: 0, marginBottom: 14, fontSize: 14 }}>
          Or start from the built-in library — for the deal and the office. Say the word to
          your assistant and it starts one for you.
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
                    <TileButton kicker={tpl.shortName} title={tpl.name} body={tpl.description} />
                  </form>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section>
        <h2 className="sectionTitle">
          Recent documents · <Link href="/documents" style={{ fontWeight: 700 }}>view all</Link>
        </h2>
        {documents.length === 0 ? (
          <p className="muted">No documents yet. Start one above or ask the assistant.</p>
        ) : (
          documents.slice(0, 8).map((doc) => {
            const kind = doc.type === "uploaded" ? "Uploaded form" : docTypeLabel(doc.type);
            const fallback = kind;
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
          Contacts · <Link href="/clients" style={{ fontWeight: 700 }}>view all</Link>
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

import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, getClientDossier } from "@/lib/db";
import { requireAccount } from "@/lib/auth";
import { docTypeLabel } from "@/lib/templates";
import { smsHref } from "@/lib/sms-link";
import { updateClientAction } from "@/app/actions";
import DeleteClientButton from "./DeleteClientButton";
import SubmitButton from "@/app/SubmitButton";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { accountId } = await requireAccount();
  const client = await getClient(accountId, id);
  if (!client) notFound();

  const dossier = await getClientDossier(accountId, client.full_name);
  const deals = dossier?.deals ?? [];

  return (
    <div className="stack">
      <div>
        <Link href="/clients" className="backlink">← Contacts</Link>
        <h1 className="pageTitle" style={{ marginTop: 10 }}>
          {client.secondary_name ? `${client.full_name} & ${client.secondary_name}` : client.full_name}
        </h1>
        <p className="pageSub">
          Everything Pheme knows about this client — edit anything and the assistant uses it
          on the next call.
        </p>
        {(client.phone || client.email) && (
          <div className="btnRow" style={{ marginTop: 12, flexWrap: "wrap" }}>
            {client.phone && (
              <a className="btn" href={`tel:${client.phone}`}>
                Call
              </a>
            )}
            {client.phone && (
              <a
                className="btn"
                href={smsHref(client.phone, `Hi ${client.full_name.split(/\s+/)[0]}, `)}
                aria-label={`Text ${client.full_name} from your phone`}
              >
                Text
              </a>
            )}
            {client.email && (
              <a className="btn" href={`mailto:${client.email}`}>
                Email
              </a>
            )}
          </div>
        )}
      </div>

      <section>
        <h2 className="sectionTitle">Details & memory</h2>
        <form action={updateClientAction.bind(null, client.id)} className="card">
          <div className="formGrid">
            <div className="field">
              <label className="label" htmlFor="ce-full_name">Full name</label>
              <input id="ce-full_name" className="input" name="full_name" defaultValue={client.full_name} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="ce-secondary_name">Co-buyer / co-seller</label>
              <input id="ce-secondary_name" className="input" name="secondary_name" defaultValue={client.secondary_name ?? ""} />
            </div>
            <div className="field">
              <label className="label" htmlFor="ce-email">Email</label>
              <input id="ce-email" className="input" name="email" type="email" defaultValue={client.email ?? ""} />
            </div>
            <div className="field">
              <label className="label" htmlFor="ce-phone">Phone</label>
              <input id="ce-phone" className="input" name="phone" type="tel" defaultValue={client.phone ?? ""} />
            </div>
            <div className="field">
              <label className="label" htmlFor="ce-role">Role</label>
              <select id="ce-role" className="input" name="role" defaultValue={client.role ?? ""}>
                <option value="">—</option>
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
                <option value="both">Buyer & seller</option>
                <option value="agent">Agent (co-broke)</option>
                <option value="attorney">Attorney</option>
                <option value="lender">Lender</option>
                <option value="inspector">Inspector</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="ce-company">Company / firm</label>
              <input id="ce-company" className="input" name="company" defaultValue={client.company ?? ""} placeholder="Brokerage, law firm…" />
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="ce-preferences">What Pheme remembers (preferences, budget, timeline…)</label>
            <textarea id="ce-preferences" className="textarea" name="preferences" defaultValue={client.preferences ?? ""} />
            <span className="hint">The assistant recalls this the moment their name comes up.</span>
          </div>
          <div className="field">
            <label className="label" htmlFor="ce-notes">Private notes</label>
            <textarea id="ce-notes" className="textarea" name="notes" defaultValue={client.notes ?? ""} />
          </div>
          <div className="btnRow">
            <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
            <DeleteClientButton clientId={client.id} />
          </div>
        </form>
      </section>

      <section>
        <h2 className="sectionTitle">Deal history ({deals.length})</h2>
        {deals.length === 0 ? (
          <p className="muted">No documents yet for this client.</p>
        ) : (
          deals.map((d) => (
            <Link key={d.id} href={`/documents/${d.id}`} className="row" style={{ textDecoration: "none" }}>
              <div>
                <div className="rowMain">
                  {d.type === "uploaded" ? "Uploaded form" : docTypeLabel(d.type)}
                  {d.property ? ` — ${d.property}` : ""}
                </div>
                <div className="rowSub">{new Date(d.date).toLocaleDateString()}</div>
              </div>
              <span className={`badge ${d.status === "completed" ? "badgeOk" : "badgeDraft"}`}>
                {d.status === "completed" ? "Filed" : "Draft"}
              </span>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}

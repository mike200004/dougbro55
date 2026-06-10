import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, getClientDossier } from "@/lib/db";
import { requireAccount } from "@/lib/auth";
import { getTemplate } from "@/lib/templates";
import { updateClientAction } from "@/app/actions";
import DeleteClientButton from "./DeleteClientButton";

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
        <Link href="/clients" className="backlink">← Clients</Link>
        <h1 className="pageTitle" style={{ marginTop: 10 }}>
          {client.secondary_name ? `${client.full_name} & ${client.secondary_name}` : client.full_name}
        </h1>
        <p className="pageSub">
          Everything Pheme knows about this client — edit anything and the assistant uses it
          on the next call.
        </p>
      </div>

      <section>
        <h2 className="sectionTitle">Details & memory</h2>
        <form action={updateClientAction.bind(null, client.id)} className="card">
          <div className="formGrid">
            <div className="field">
              <label className="label">Full name</label>
              <input className="input" name="full_name" defaultValue={client.full_name} required />
            </div>
            <div className="field">
              <label className="label">Co-buyer / co-seller</label>
              <input className="input" name="secondary_name" defaultValue={client.secondary_name ?? ""} />
            </div>
            <div className="field">
              <label className="label">Email</label>
              <input className="input" name="email" defaultValue={client.email ?? ""} />
            </div>
            <div className="field">
              <label className="label">Phone</label>
              <input className="input" name="phone" defaultValue={client.phone ?? ""} />
            </div>
            <div className="field">
              <label className="label">Role</label>
              <select className="input" name="role" defaultValue={client.role ?? ""}>
                <option value="">—</option>
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
                <option value="both">Both</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label className="label">What Pheme remembers (preferences, budget, timeline…)</label>
            <textarea className="textarea" name="preferences" defaultValue={client.preferences ?? ""} />
            <span className="hint">The assistant recalls this the moment their name comes up.</span>
          </div>
          <div className="field">
            <label className="label">Private notes</label>
            <textarea className="textarea" name="notes" defaultValue={client.notes ?? ""} />
          </div>
          <div className="btnRow">
            <button type="submit" className="btn btnPrimary">Save</button>
            <DeleteClientButton clientId={client.id} />
          </div>
        </form>
      </section>

      <section>
        <h2 className="sectionTitle">Deal history ({deals.length})</h2>
        {deals.length === 0 ? (
          <p className="muted">No documents yet for this client.</p>
        ) : (
          deals.map((d, i) => (
            <div key={i} className="row">
              <div>
                <div className="rowMain">
                  {d.type === "uploaded" ? "Uploaded form" : getTemplate(d.type as Parameters<typeof getTemplate>[0]).shortName}
                  {d.property ? ` — ${d.property}` : ""}
                </div>
                <div className="rowSub">{new Date(d.date).toLocaleDateString()}</div>
              </div>
              <span className={`badge ${d.status === "completed" ? "badgeOk" : "badgeDraft"}`}>
                {d.status === "completed" ? "Filed" : "Draft"}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

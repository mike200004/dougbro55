import Link from "next/link";
import { listClients } from "@/lib/db";
import { requireAccount } from "@/lib/auth";
import AddClient from "../AddClient";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { accountId } = await requireAccount();
  const { q = "" } = await searchParams;
  const clients = await listClients(accountId);
  const needle = q.toLowerCase().trim();
  const filtered = needle
    ? clients.filter((c) =>
        [c.full_name, c.secondary_name, c.email, c.phone]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle)),
      )
    : clients;

  return (
    <div className="stack">
      <div>
        <h1 className="pageTitle">Clients</h1>
        <p className="pageSub">
          Your book of business — Pheme adds people automatically from every form you fill,
          and remembers their preferences for next time.
        </p>
      </div>

      <form method="GET" className="btnRow">
        <input className="input" style={{ flex: "1 1 240px" }} name="q" defaultValue={q} placeholder="Search clients…" />
        <button className="btn" type="submit">Search</button>
      </form>

      {filtered.length === 0 ? (
        <p className="muted">No clients yet — fill your first document and Pheme will start remembering people.</p>
      ) : (
        <div>
          {filtered.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`} className="row" style={{ textDecoration: "none" }}>
              <div style={{ minWidth: 0 }}>
                <div className="rowMain">
                  {c.secondary_name ? `${c.full_name} & ${c.secondary_name}` : c.full_name}
                </div>
                <div className="rowSub">
                  {[c.role, c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                </div>
                {c.preferences && <div className="rowNote">Remembers: {c.preferences}</div>}
              </div>
              {c.role && <span className="badge">{c.role}</span>}
            </Link>
          ))}
        </div>
      )}

      <section>
        <h2 className="sectionTitle">Add a client</h2>
        <AddClient />
      </section>
    </div>
  );
}

import Link from "next/link";
import { listClients } from "@/lib/db";
import { requireAccount } from "@/lib/auth";
import AddClient from "../AddClient";

export const dynamic = "force-dynamic";

const TABS = [
  { id: "all", label: "Everyone" },
  { id: "clients", label: "Clients" },
  { id: "agent", label: "Agents" },
  { id: "attorney", label: "Attorneys" },
  { id: "pro", label: "Other pros" },
] as const;

const CLIENT_ROLES = new Set(["buyer", "seller", "both"]);

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string }>;
}) {
  const { accountId } = await requireAccount();
  const { q = "", f = "all" } = await searchParams;
  const clients = await listClients(accountId);
  const needle = q.toLowerCase().trim();
  const filtered = clients.filter((c) => {
    if (
      needle &&
      ![c.full_name, c.secondary_name, c.email, c.phone, c.company]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    ) {
      return false;
    }
    switch (f) {
      case "clients":
        return !c.role || CLIENT_ROLES.has(c.role);
      case "agent":
        return c.role === "agent";
      case "attorney":
        return c.role === "attorney";
      case "pro":
        return c.role === "lender" || c.role === "inspector" || c.role === "other";
      default:
        return true;
    }
  });

  return (
    <div className="stack">
      <div>
        <h1 className="pageTitle">Contacts</h1>
        <p className="pageSub">
          Your rolodex — clients, co-broke agents, attorneys, lenders. Pheme adds people
          automatically from every form you fill and remembers them for next time.
        </p>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <form method="GET" className="btnRow" style={{ alignItems: "center" }}>
          <input className="input" style={{ flex: "1 1 240px" }} name="q" defaultValue={q} placeholder="Search contacts…" />
          <input type="hidden" name="f" value={f} />
          <button className="btn" type="submit">Search</button>
        </form>
        <div className="btnRow" style={{ marginTop: 12 }}>
          {TABS.map((tab) => {
            const active = f === tab.id;
            return (
              <Link
                key={tab.id}
                href={`/clients?f=${tab.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className="btn"
                style={{
                  textDecoration: "none",
                  padding: "6px 14px",
                  fontSize: 13,
                  ...(active
                    ? { background: "var(--ink)", color: "var(--surface)", borderColor: "var(--ink)" }
                    : {}),
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="muted">
          {needle ? (
            <>
              No contacts match “{q}”. <Link href={`/clients?f=${f}`}>Clear search</Link>
            </>
          ) : (
            "No one here yet — fill your first document and Pheme starts remembering people."
          )}
        </p>
      ) : (
        <div>
          {filtered.map((c) => (
            <Link key={c.id} href={`/clients/${c.id}`} className="row" style={{ textDecoration: "none" }}>
              <div style={{ minWidth: 0 }}>
                <div className="rowMain">
                  {c.secondary_name ? `${c.full_name} & ${c.secondary_name}` : c.full_name}
                </div>
                <div className="rowSub">
                  {[c.company, c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                </div>
                {c.preferences && <div className="rowNote">Remembers: {c.preferences}</div>}
              </div>
              {c.role && <span className="badge">{c.role}</span>}
            </Link>
          ))}
        </div>
      )}

      <section>
        <h2 className="sectionTitle">Add a contact</h2>
        <AddClient />
      </section>
    </div>
  );
}

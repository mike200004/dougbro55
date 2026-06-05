import Link from "next/link";
import { getProfile, listMembers } from "@/lib/db";
import { requireAccount } from "@/lib/auth";
import { saveProfileAction } from "@/app/actions";
import type { AgentProfile } from "@/lib/types";
import Team from "./Team";

export const dynamic = "force-dynamic";

const FIELDS: { key: keyof AgentProfile; label: string; hint?: string }[] = [
  { key: "agent_name", label: "Agent name (authorized representative)" },
  { key: "phone", label: "Agent mobile phone", hint: "Used on forms and to match the agent's calls/texts." },
  { key: "broker_agency_name", label: "Broker / agency name" },
  { key: "license_number", label: "License number" },
  { key: "street", label: "Street address" },
  { key: "city_state_zip", label: "City / State / ZIP" },
  { key: "email", label: "Email" },
];

export default async function SettingsPage() {
  const { accountId, role } = await requireAccount();
  const [profile, members] = await Promise.all([
    getProfile(accountId),
    listMembers(accountId),
  ]);
  const isOwner = role === "owner";

  return (
    <div className="stack">
      <div>
        <Link href="/" className="backlink">← Dashboard</Link>
        <h1 className="pageTitle" style={{ marginTop: 10 }}>Settings</h1>
        <p className="pageSub">
          The agent/brokerage profile auto-fills the broker side of every document.
        </p>
      </div>

      <section>
        <h2 className="sectionTitle">Agent profile</h2>
        {isOwner ? (
          <form action={saveProfileAction} className="card">
            <div className="formGrid">
              {FIELDS.map((f) => (
                <div className="field" key={f.key}>
                  <label className="label">{f.label}</label>
                  <input className="input" name={f.key} defaultValue={profile?.[f.key] ?? ""} />
                  {f.hint && <span className="hint">{f.hint}</span>}
                </div>
              ))}
            </div>
            <button type="submit" className="btn btnPrimary">Save profile</button>
          </form>
        ) : (
          <div className="card">
            <p className="muted">
              Only the account owner can edit the agent/brokerage profile. You’re acting on{" "}
              {profile?.agent_name || "the agent"}’s account.
            </p>
          </div>
        )}
      </section>

      <Team
        members={members.map((m) => ({
          id: m.id,
          role: m.role,
          name: m.name,
          phone: m.phone,
          email: m.email,
          status: m.status,
        }))}
        isOwner={isOwner}
      />
    </div>
  );
}

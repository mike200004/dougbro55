import Link from "next/link";
import { getProfile } from "@/lib/db";
import { requireAccount } from "@/lib/auth";
import { saveProfileAction } from "@/app/actions";
import type { AgentProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

const FIELDS: { key: keyof AgentProfile; label: string; hint?: string }[] = [
  { key: "agent_name", label: "Your name (authorized representative)" },
  { key: "phone", label: "Mobile phone", hint: "The number you call/text from — how the assistant matches you." },
  { key: "broker_agency_name", label: "Broker / agency name" },
  { key: "license_number", label: "License number" },
  { key: "street", label: "Street address" },
  { key: "city_state_zip", label: "City / State / ZIP" },
  { key: "email", label: "Email" },
];

export default async function SettingsPage() {
  const { userId } = await requireAccount();
  const profile = await getProfile(userId);

  return (
    <div className="stack">
      <div>
        <Link href="/" className="backlink">← Dashboard</Link>
        <h1 className="pageTitle" style={{ marginTop: 10 }}>Agent profile</h1>
        <p className="pageSub">
          These details auto-fill the broker/agency side of every document, so you never
          have to re-type them.
        </p>
      </div>

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
    </div>
  );
}

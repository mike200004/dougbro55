import Link from "next/link";
import { getProfile, usingSupabase } from "@/lib/db";
import { saveProfileAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const FIELDS: { key: keyof NonNullable<Awaited<ReturnType<typeof getProfile>>>; label: string }[] = [
  { key: "agent_name", label: "Your name (authorized representative)" },
  { key: "broker_agency_name", label: "Broker / agency name" },
  { key: "license_number", label: "License number" },
  { key: "street", label: "Street address" },
  { key: "city_state_zip", label: "City / State / ZIP" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
];

export default async function SettingsPage() {
  const profile = await getProfile();

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

      {!usingSupabase && (
        <div className="notice">
          Running on local storage (Supabase not connected yet). Data is saved to a local
          file and will persist in dev. Add Supabase env vars to switch to the cloud DB.
        </div>
      )}

      <form action={saveProfileAction} className="card">
        <div className="formGrid">
          {FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <label className="label">{f.label}</label>
              <input className="input" name={f.key} defaultValue={profile?.[f.key] ?? ""} />
            </div>
          ))}
        </div>
        <button type="submit" className="btn btnPrimary">Save profile</button>
      </form>
    </div>
  );
}

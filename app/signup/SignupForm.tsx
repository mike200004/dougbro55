"use client";

import { useState } from "react";
import { createAccountAction } from "@/app/actions";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export default function SignupForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "");
    const password = String(fd.get("password") || "");

    const res = await createAccountAction({
      email,
      password,
      agent_name: String(fd.get("agent_name") || ""),
      phone: String(fd.get("phone") || ""),
      broker_agency_name: String(fd.get("broker_agency_name") || ""),
      license_number: String(fd.get("license_number") || ""),
      street: String(fd.get("street") || ""),
      city_state_zip: String(fd.get("city_state_zip") || ""),
    });

    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }

    const supabase = createSupabaseBrowser();
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInErr) {
      setError("Account created, but sign-in failed: " + signInErr.message);
      setBusy(false);
      return;
    }
    window.location.assign("/");
  }

  return (
    <form onSubmit={submit} className="authCard">
      <div className="formGrid">
        <div className="field">
          <label className="label">Your name <span className="req">*</span></label>
          <input className="input" name="agent_name" required />
        </div>
        <div className="field">
          <label className="label">Mobile phone <span className="req">*</span></label>
          <input className="input" name="phone" placeholder="(203) 555-0123" required />
        </div>
        <div className="field">
          <label className="label">Email <span className="req">*</span></label>
          <input className="input" name="email" type="email" required />
        </div>
        <div className="field">
          <label className="label">Password <span className="req">*</span></label>
          <input className="input" name="password" type="password" minLength={8} required />
        </div>
        <div className="field">
          <label className="label">Broker / agency name</label>
          <input className="input" name="broker_agency_name" />
        </div>
        <div className="field">
          <label className="label">License number</label>
          <input className="input" name="license_number" />
        </div>
        <div className="field">
          <label className="label">Street address</label>
          <input className="input" name="street" />
        </div>
        <div className="field">
          <label className="label">City / State / ZIP</label>
          <input className="input" name="city_state_zip" />
        </div>
      </div>
      <p className="hint" style={{ marginBottom: 12 }}>
        Use the mobile number you’ll call/text from — that’s how the assistant knows it’s you.
      </p>
      {error && <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>}
      <button type="submit" className="btn btnPrimary" disabled={busy}>
        {busy ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}

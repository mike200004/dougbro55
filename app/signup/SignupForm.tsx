"use client";

import { useState } from "react";
import { createAccountAction } from "@/app/actions";

export default function SignupForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

    // Private beta: the account is created pending approval — don't sign in,
    // show the confirmation instead.
    setPending(true);
    setBusy(false);
  }

  if (pending) {
    return (
      <div className="authCard" style={{ textAlign: "center" }}>
        <h2 className="cardTitle" style={{ marginTop: 0 }}>You’re on the list ✓</h2>
        <p className="cardBody">
          Pheme is in private beta. Your account is <strong>pending approval</strong> — we
          review new accounts by hand and you’ll get an email the moment you’re in.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="authCard">
      <div className="formGrid">
        <div className="field">
          <label className="label" htmlFor="su-agent_name">Your name <span className="req">*</span></label>
          <input id="su-agent_name" className="input" name="agent_name" autoComplete="name" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="su-phone">Mobile phone <span className="req">*</span></label>
          <input id="su-phone" className="input" name="phone" type="tel" autoComplete="tel" placeholder="(203) 555-0123" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="su-email">Email <span className="req">*</span></label>
          <input id="su-email" className="input" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label className="label" htmlFor="su-password">Password <span className="req">*</span></label>
          <input id="su-password" className="input" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <div className="field">
          <label className="label" htmlFor="su-broker_agency_name">Broker / agency name</label>
          <input id="su-broker_agency_name" className="input" name="broker_agency_name" autoComplete="organization" />
        </div>
        <div className="field">
          <label className="label" htmlFor="su-license_number">License number</label>
          <input id="su-license_number" className="input" name="license_number" />
        </div>
        <div className="field">
          <label className="label" htmlFor="su-street">Street address</label>
          <input id="su-street" className="input" name="street" autoComplete="street-address" />
        </div>
        <div className="field">
          <label className="label" htmlFor="su-city_state_zip">City / State / ZIP</label>
          <input id="su-city_state_zip" className="input" name="city_state_zip" />
        </div>
      </div>
      <p className="hint" style={{ marginBottom: 12 }}>
        Use the mobile number you’ll call from — that’s how the assistant knows it’s you.
      </p>
      {error && <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>}
      <button type="submit" className="btn btnPrimary" disabled={busy}>
        {busy ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}

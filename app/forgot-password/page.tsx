"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // The action always succeeds (no account enumeration) and sends the email
    // through Resend when the address matches an account.
    const res = await requestPasswordResetAction(email.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSent(true);
  }

  return (
    <div className="authWrap">
      <h1 className="pageTitle">Reset your password</h1>
      <p className="pageSub">We’ll email you a secure link to set a new one.</p>
      {sent ? (
        <div className="card" style={{ marginTop: 20 }}>
          <p>
            Check <strong>{email}</strong> — if an account exists for that address, a reset
            link is on its way. It’s single-use and expires in about an hour.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="authCard">
          <div className="field">
            <label className="label" htmlFor="fp-email">Email</label>
            <input id="fp-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {error && <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>}
          <button type="submit" className="btn btnPrimary" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <p className="muted" style={{ marginTop: 16 }}>
        Remembered it? <Link href="/login">Sign in</Link>.
      </p>
    </div>
  );
}

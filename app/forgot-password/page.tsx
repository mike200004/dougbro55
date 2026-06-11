"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
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
            link is on its way.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="authCard">
          <div className="field">
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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

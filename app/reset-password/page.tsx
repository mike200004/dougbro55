"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The recovery link establishes a session; give the client a moment to pick
  // up the token from the URL.
  useEffect(() => {
    const supabase = createSupabaseBrowser();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setReady(true);
      else {
        setTimeout(async () => {
          const { data: d2 } = await supabase.auth.getUser();
          if (d2.user) setReady(true);
          else setError("This reset link is invalid or has expired. Request a new one from the sign-in page.");
        }, 1200);
      }
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    window.location.assign("/");
  }

  return (
    <div className="authWrap">
      <h1 className="pageTitle">Choose a new password</h1>
      <p className="pageSub">You’ll be signed in right after.</p>
      {error && !ready ? (
        <div className="notice" style={{ marginTop: 20 }}>{error}</div>
      ) : (
        <form onSubmit={submit} className="authCard">
          <div className="field">
            <label className="label">New password</label>
            <input
              className="input"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={!ready}
            />
          </div>
          {error && <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>}
          <button type="submit" className="btn btnPrimary" disabled={busy || !ready}>
            {busy ? "Saving…" : ready ? "Set new password" : "Loading…"}
          </button>
        </form>
      )}
    </div>
  );
}

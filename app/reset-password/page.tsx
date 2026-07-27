"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";

function ResetPassword() {
  const params = useSearchParams();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Two link formats both land here:
  //  1. Our Resend email: ?token_hash=…&type=recovery → verifyOtp (needs no
  //     redirect allowlist, works regardless of the project's Site URL).
  //  2. Supabase's own recovery redirect (hash fragment) → onAuthStateChange.
  useEffect(() => {
    const supabase = createSupabaseBrowser();
    let settled = false;

    const tokenHash = params.get("token_hash");
    if (tokenHash) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" }).then(({ error }) => {
        settled = true;
        if (error) {
          setError(
            "This reset link is invalid or has expired — they're single-use. Request a new one from the sign-in page.",
          );
        } else {
          setReady(true);
        }
      });
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        settled = true;
        setReady(true);
        setError(null);
      }
    });
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        settled = true;
        setReady(true);
      }
    });
    const timer = setTimeout(() => {
      if (!settled) {
        setError(
          "This reset link is invalid or has expired — they're single-use and must be opened in the same browser. Request a new one from the sign-in page.",
        );
      }
    }, 6000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [params]);

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
      {!ready && !error && <p className="muted" style={{ marginTop: 12 }}>Verifying your reset link…</p>}
      {error && !ready ? (
        <div className="notice" style={{ marginTop: 20 }}>{error}</div>
      ) : (
        <form onSubmit={submit} className="authCard">
          <div className="field">
            <label className="label" htmlFor="rp-password">New password</label>
            <input
              id="rp-password"
              className="input"
              type="password"
              autoComplete="new-password"
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

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPassword />
    </Suspense>
  );
}

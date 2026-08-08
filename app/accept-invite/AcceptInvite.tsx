"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { acceptInviteAction } from "@/app/actions";

export default function AcceptInvite() {
  const params = useSearchParams();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invites delivered through Resend carry ?token_hash=…&type=invite; verify it
  // directly (no redirect allowlist needed). Older Supabase-sent invites set a
  // session from the URL hash instead — fall back to that.
  useEffect(() => {
    const supabase = createSupabaseBrowser();
    const tokenHash = params.get("token_hash");

    if (tokenHash) {
      // Same shape as the reset link: without a rejection handler or timeout,
      // a blip leaves the invited assistant on "Verifying your invite…" with a
      // disabled field and no way forward.
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        setError("This invite link couldn't be verified — check your connection, or ask the owner to re-send it.");
      }, 8000);
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: "invite" })
        .then(({ data, error }) => {
          if (settled) return;
          settled = true;
          if (!error && data.user) setReady(true);
          else setError("This invite link is invalid or has expired. Ask the owner to re-invite you.");
        })
        .catch(() => {
          if (settled) return;
          settled = true;
          setError("This invite link couldn't be verified — check your connection, or ask the owner to re-send it.");
        })
        .finally(() => clearTimeout(timer));
      return () => clearTimeout(timer);
    }

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setReady(true);
      else {
        setTimeout(async () => {
          const { data: d2 } = await supabase.auth.getUser();
          if (d2.user) setReady(true);
          else setError("This invite link is invalid or has expired. Ask the owner to re-invite you.");
        }, 1200);
      }
    });
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      // Activation must be CHECKED: if it silently no-ops the assistant lands
      // on /pending and is shown owner-waitlist copy, which is simply wrong
      // for someone an owner just invited.
      const activated = await acceptInviteAction();
      if (activated && activated.ok === false) {
        setError(activated.error || "We couldn't finish setting up your access — ask the owner to re-send the invite.");
        setBusy(false);
        return;
      }
    } catch {
      setError("We couldn't reach the server — check your connection and try again.");
      setBusy(false);
      return;
    }
    window.location.assign("/");
  }

  if (error && !ready) {
    return <div className="notice">{error}</div>;
  }

  return (
    <form onSubmit={submit} className="card">
      {!ready && !error && <p className="muted" style={{ marginBottom: 14 }}>Verifying your invite…</p>}
      <div className="field">
        <label className="label" htmlFor="ai-password">New password</label>
        <input
          id="ai-password"
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
        {busy ? "Saving…" : ready ? "Set password & continue" : "Loading invite…"}
      </button>
    </form>
  );
}

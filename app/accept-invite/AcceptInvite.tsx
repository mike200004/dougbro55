"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { acceptInviteAction } from "@/app/actions";

export default function AcceptInvite() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The invite link carries a session token; @supabase/ssr picks it up on load.
  useEffect(() => {
    const supabase = createSupabaseBrowser();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setReady(true);
      else {
        // Give the client a moment to process the token from the URL.
        setTimeout(async () => {
          const { data: d2 } = await supabase.auth.getUser();
          if (d2.user) setReady(true);
          else setError("This invite link is invalid or has expired. Ask the owner to re-invite you.");
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
    await acceptInviteAction();
    router.refresh();
    router.push("/");
  }

  if (error && !ready) {
    return <div className="notice">{error}</div>;
  }

  return (
    <form onSubmit={submit} className="card">
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
        {busy ? "Saving…" : ready ? "Set password & continue" : "Loading invite…"}
      </button>
    </form>
  );
}

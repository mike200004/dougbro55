"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export default function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    // Full navigation so the server-rendered layout (nav) reflects auth state.
    // Only same-origin paths — `next` must never become an open redirect.
    const next = params.get("next");
    // Same-origin paths only. Backslashes are rejected explicitly: browsers
    // treat "/\evil.com" like "//evil.com" (WHATWG URL), which would slip
    // past the double-slash check and become an open redirect.
    const dest =
      next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
    window.location.assign(dest);
  }

  return (
    <form onSubmit={submit} className="authCard">
      <div className="field">
        <label className="label" htmlFor="login-email">Email</label>
        <input id="login-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="field">
        <label className="label" htmlFor="login-password">Password</label>
        <input id="login-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>}
      <button type="submit" className="btn btnPrimary" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

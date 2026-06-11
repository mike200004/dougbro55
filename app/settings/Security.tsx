"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { deleteAccountAction } from "@/app/actions";

export default function Security({ email, isOwner }: { email: string; isOwner: boolean }) {
  const [sent, setSent] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="rowMain">Password</div>
            <div className="rowSub">We’ll email {email} a secure link to set a new password.</div>
          </div>
          <button
            className="btn"
            disabled={sent}
            onClick={async () => {
              const supabase = createSupabaseBrowser();
              await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              setSent(true);
            }}
          >
            {sent ? "Email sent ✓" : "Change password"}
          </button>
        </div>
      </div>

      {isOwner && (
        <div className="card" style={{ borderColor: "#e6b8b2" }}>
          <div className="rowMain" style={{ color: "var(--danger)" }}>Danger zone</div>
          <div className="rowSub" style={{ marginBottom: 12 }}>
            Deleting your account permanently removes your documents, clients, forms, team,
            and signatures. This cannot be undone. Type <strong>DELETE</strong> to confirm.
          </div>
          <div className="btnRow">
            <input
              className="input"
              style={{ maxWidth: 160 }}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
            />
            <button
              className="btn btnDanger"
              disabled={busy || confirmText !== "DELETE"}
              onClick={async () => {
                if (!confirm("Last check — permanently delete this account and all its data?")) return;
                setBusy(true);
                const res = await deleteAccountAction(confirmText);
                if (!res.ok) {
                  setErr(res.error);
                  setBusy(false);
                  return;
                }
                window.location.assign("/");
              }}
            >
              {busy ? "Deleting…" : "Delete account"}
            </button>
          </div>
          {err && <p style={{ color: "var(--danger)", marginTop: 10 }}>{err}</p>}
        </div>
      )}
    </>
  );
}

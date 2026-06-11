"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { deleteAccountAction } from "@/app/actions";

export default function Security({ email, isOwner }: { email: string; isOwner: boolean }) {
  const [sent, setSent] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
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
            disabled={sent || pwBusy}
            onClick={async () => {
              setPwBusy(true);
              setPwErr(null);
              const supabase = createSupabaseBrowser();
              const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              setPwBusy(false);
              if (error) setPwErr(error.message);
              else setSent(true);
            }}
          >
            {pwBusy ? "Sending…" : sent ? "Email sent ✓" : "Change password"}
          </button>
        </div>
        {pwErr && <p style={{ color: "var(--danger)", marginTop: 10 }}>{pwErr}</p>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="rowMain">Login email</div>
        <div className="rowSub" style={{ marginBottom: 12 }}>
          Currently {email}. Changing it sends a confirmation link to the new address.
        </div>
        <div className="btnRow">
          <input
            className="input"
            style={{ maxWidth: 280 }}
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@email.com"
          />
          <button
            className="btn"
            disabled={emailBusy || !/.+@.+\..+/.test(newEmail)}
            onClick={async () => {
              setEmailBusy(true);
              setEmailErr(null);
              setEmailMsg(null);
              const { error } = await createSupabaseBrowser().auth.updateUser({ email: newEmail.trim() });
              setEmailBusy(false);
              if (error) setEmailErr(error.message);
              else setEmailMsg("Check the new address for a confirmation link — the change applies once confirmed.");
            }}
          >
            {emailBusy ? "Sending…" : "Change email"}
          </button>
        </div>
        {emailMsg && <p style={{ color: "var(--ok)", marginTop: 10 }}>{emailMsg}</p>}
        {emailErr && <p style={{ color: "var(--danger)", marginTop: 10 }}>{emailErr}</p>}
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

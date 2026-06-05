"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteAssistantAction, removeAssistantAction } from "@/app/actions";

interface Member {
  id: string;
  role: "owner" | "assistant";
  name: string;
  phone: string | null;
  email: string | null;
  status: "active" | "invited";
}

export default function Team({
  members,
  isOwner,
}: {
  members: Member[];
  isOwner: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const fd = new FormData(e.currentTarget);
    const res = await inviteAssistantAction({
      name: String(fd.get("name") || ""),
      email: String(fd.get("email") || ""),
      phone: String(fd.get("phone") || ""),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotice("Invite sent. They'll get an email to set a password.");
    setOpen(false);
    router.refresh();
  }

  return (
    <section>
      <h2 className="sectionTitle">Your assistants</h2>
      <p className="pageSub" style={{ marginTop: 0, marginBottom: 16, fontSize: 14 }}>
        Invite a team member. They get their own login and phone number, but everything
        they do flows into your account — and you’ll see who did what.
      </p>

      <div style={{ marginBottom: 16 }}>
        {members.map((m) => (
          <div key={m.id} className="row">
            <div>
              <div className="rowMain">
                {m.name || "(unnamed)"}{" "}
                <span className={`badge ${m.role === "owner" ? "badgeOk" : "badgeDraft"}`}>
                  {m.role}
                </span>
                {m.status === "invited" && <span className="badge"> invited</span>}
              </div>
              <div className="rowSub">
                {[m.email, m.phone].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            {isOwner && m.role === "assistant" && (
              <button
                className="btn"
                onClick={async () => {
                  if (!confirm(`Remove ${m.name || "this assistant"}?`)) return;
                  await removeAssistantAction(m.id);
                  router.refresh();
                }}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {notice && <p className="muted" style={{ marginBottom: 12 }}>{notice}</p>}

      {isOwner &&
        (open ? (
          <form onSubmit={invite} className="card">
            <div className="formGrid">
              <div className="field">
                <label className="label">Assistant name</label>
                <input className="input" name="name" required />
              </div>
              <div className="field">
                <label className="label">Email (for the invite)</label>
                <input className="input" name="email" type="email" required />
              </div>
              <div className="field">
                <label className="label">Their mobile number</label>
                <input className="input" name="phone" placeholder="(203) 555-0123" required />
              </div>
            </div>
            {error && <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>}
            <div className="btnRow">
              <button type="submit" className="btn btnPrimary" disabled={busy}>
                {busy ? "Sending…" : "Send invite"}
              </button>
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button className="btn" onClick={() => setOpen(true)}>
            + Invite assistant
          </button>
        ))}
    </section>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import {
  saveDocumentFieldsAction,
  sendDocumentAction,
  setDocumentStatusAction,
  cancelSignatureRequestAction,
} from "@/app/actions";

interface FieldDef {
  key: string;
  label: string;
  type: string;
  required: boolean;
  hint: string | null;
  options?: string[] | null;
  section?: string | null;
  pairedWith?: string[] | null;
}

interface SignatureRow {
  id: string;
  signer: string;
  contact: string;
  status: string;
  created_at: string;
  signUrl: string | null;
}

export default function DocumentEditor({
  docId,
  title,
  status,
  fields,
  values,
  locked = false,
  signatures = [],
}: {
  docId: string;
  title: string;
  status: string;
  fields: FieldDef[];
  values: Record<string, string>;
  locked?: boolean;
  signatures?: SignatureRow[];
}) {
  const [vals, setVals] = useState<Record<string, string>>(values);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const missing = fields.filter((f) => f.required && !vals[f.key]?.trim());
  const complete = status === "completed";

  // Group fields by section, preserving order of first appearance.
  const sections = useMemo(() => {
    const out: { name: string | null; fields: FieldDef[] }[] = [];
    for (const f of fields) {
      const name = f.section ?? null;
      const last = out[out.length - 1];
      if (last && last.name === name) last.fields.push(f);
      else out.push({ name, fields: [f] });
    }
    return out;
  }, [fields]);

  function update(key: string, v: string) {
    setVals((p) => {
      const next = { ...p, [key]: v };
      // Mutually-exclusive pairs ("is / is not contingent"): checking one
      // clears its partners so a legal document can't say both.
      const def = fields.find((f) => f.key === key);
      if (def?.type === "checkbox" && v === "Yes") {
        for (const partner of def.pairedWith ?? []) next[partner] = "";
      }
      return next;
    });
    setSaved(false);
    setDirty(true);
  }

  async function save(formData: FormData) {
    setSaving(true);
    await saveDocumentFieldsAction(docId, formData);
    setSaving(false);
    setSaved(true);
    setDirty(false);
  }

  async function saveNow() {
    if (!formRef.current) return;
    setSaving(true);
    await saveDocumentFieldsAction(docId, new FormData(formRef.current));
    setSaving(false);
    setSaved(true);
    setDirty(false);
  }

  return (
    <>
      <form action={save} ref={formRef}>
        <div className="field">
          <label className="label">Document title</label>
          <input
            className="input"
            name="__title"
            defaultValue={title}
            disabled={locked}
            onChange={() => {
              setSaved(false);
              setDirty(true);
            }}
          />
        </div>

        {sections.map((sec, i) => (
          <div className="card" key={sec.name ?? `s${i}`} style={{ marginBottom: 16 }}>
            {sec.name && (
              <div className="cardKicker" style={{ marginBottom: 12 }}>{sec.name}</div>
            )}
            <div className="formGrid">
              {sec.fields.map((f) => (
                <div className="field" key={f.key}>
                  <label className="label">
                    {f.label} {f.required && <span className="req">*</span>}
                  </label>
                  {f.type === "longtext" ? (
                    <textarea
                      className="textarea"
                      name={f.key}
                      value={vals[f.key] ?? ""}
                      disabled={locked}
                      onChange={(e) => update(f.key, e.target.value)}
                    />
                  ) : f.type === "dropdown" ? (
                    <select
                      className="input"
                      name={f.key}
                      value={vals[f.key] ?? ""}
                      disabled={locked}
                      onChange={(e) => update(f.key, e.target.value)}
                    >
                      <option value="">—</option>
                      {(f.options ?? []).map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : f.type === "checkbox" ? (
                    <select
                      className="input"
                      name={f.key}
                      value={vals[f.key] ?? ""}
                      disabled={locked}
                      onChange={(e) => update(f.key, e.target.value)}
                    >
                      <option value="">No</option>
                      <option value="Yes">Yes</option>
                    </select>
                  ) : (
                    <input
                      className="input"
                      name={f.key}
                      value={vals[f.key] ?? ""}
                      disabled={locked}
                      onChange={(e) => update(f.key, e.target.value)}
                      placeholder={f.hint ?? undefined}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {missing.length > 0 && (
          <p className="muted" style={{ marginBottom: 14 }}>
            Still needed before filing: {missing.map((f) => f.label).join(", ")}
          </p>
        )}

        <div className="btnRow">
          <button type="submit" className="btn btnPrimary" disabled={saving || locked}>
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={saving}
            onClick={async () => {
              // Don't hand someone a PDF that's missing their latest edits.
              if (dirty && !locked) await saveNow();
              window.open(`/api/documents/${docId}/pdf`, "_blank", "noopener,noreferrer");
            }}
          >
            Download / preview PDF
          </button>
          {!locked && (
            <StatusButton
              docId={docId}
              complete={complete}
              canComplete={missing.length === 0}
              dirty={dirty}
              saveNow={saveNow}
            />
          )}
        </div>
      </form>

      {signatures.length > 0 && <SignatureList docId={docId} rows={signatures} />}

      {!locked && (
        <>
          <SendByText docId={docId} disabled={missing.length > 0} dirty={dirty} saveNow={saveNow} />
          <SendForSignature docId={docId} disabled={missing.length > 0} dirty={dirty} saveNow={saveNow} />
        </>
      )}
    </>
  );
}

function SignatureList({ docId, rows }: { docId: string; rows: SignatureRow[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
      <h2 className="sectionTitle">Signatures</h2>
      {rows.map((r) => (
        <div key={r.id} className="row" style={{ padding: "10px 18px" }}>
          <div>
            <div className="rowMain">{r.signer}</div>
            <div className="rowSub">
              {[r.contact, new Date(r.created_at).toLocaleDateString()].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="btnRow" style={{ alignItems: "center" }}>
            <span className={`badge ${r.status === "signed" ? "badgeOk" : "badgeDraft"}`}>
              {r.status === "signed" ? "Signed" : "Awaiting signature"}
            </span>
            {r.signUrl && (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    await navigator.clipboard.writeText(r.signUrl!);
                    setCopied(r.id);
                    setTimeout(() => setCopied(null), 2000);
                  }}
                >
                  {copied === r.id ? "Copied ✓" : "Copy link"}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy === r.id}
                  onClick={async () => {
                    setBusy(r.id);
                    try {
                      await cancelSignatureRequestAction(r.id, docId);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === r.id ? "Canceling…" : "Cancel"}
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SendForSignature({
  docId,
  disabled,
  dirty,
  saveNow,
}: {
  docId: string;
  disabled: boolean;
  dirty: boolean;
  saveNow: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      if (dirty) await saveNow();
      const { requestSignatureAction } = await import("@/app/actions");
      const res = await requestSignatureAction({
        docId,
        signerName: name,
        signerEmail: email,
        signerPhone: phone,
      });
      if (res.ok) {
        if (res.delivered === false && res.sign_url) {
          setMsg("The request was created, but the link couldn't be delivered automatically — copy it below and send it yourself.");
          setFallbackUrl(res.sign_url);
        } else {
          setMsg(`Signature request sent to ${name}. You'll be notified the moment they sign.`);
          setFallbackUrl(null);
        }
        setOpen(false);
      } else {
        setErr(res.error);
      }
    } catch {
      setErr("Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
      <h2 className="sectionTitle">Send for signature</h2>
      {disabled ? (
        <p className="muted">Fill the required fields above to enable e-signature.</p>
      ) : !open ? (
        <>
          {msg && <p style={{ color: "var(--ok)", marginBottom: 10 }}>{msg}</p>}
          {fallbackUrl && (
            <p style={{ marginBottom: 10 }}>
              <code style={{ fontSize: 12, wordBreak: "break-all" }}>{fallbackUrl}</code>{" "}
              <button
                type="button"
                className="btn"
                onClick={() => navigator.clipboard.writeText(fallbackUrl)}
              >
                Copy
              </button>
            </p>
          )}
          <button type="button" className="btn" onClick={() => setOpen(true)}>
            Request an e-signature
          </button>
        </>
      ) : (
        <div className="card">
          <div className="formGrid">
            <div className="field">
              <label className="label">Signer’s full name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
              />
            </div>
            <div className="field">
              <label className="label">Signer’s email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
              />
            </div>
            <div className="field">
              <label className="label">…or mobile number</label>
              <input
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(203) 555-0123"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
              />
            </div>
          </div>
          {err && <p style={{ color: "var(--danger)", marginBottom: 10 }}>{err}</p>}
          <div className="btnRow">
            <button
              type="button"
              className="btn btnPrimary"
              disabled={busy || !name.trim() || (!email.trim() && !phone.trim())}
              onClick={submit}
            >
              {busy ? "Sending…" : "Send request"}
            </button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SendByText({
  docId,
  disabled,
  dirty,
  saveNow,
}: {
  docId: string;
  disabled: boolean;
  dirty: boolean;
  saveNow: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (dirty) await saveNow();
      const res = await sendDocumentAction(docId, phone, name);
      if (res.ok) {
        setMsg(`Sent a link to ${phone}.`);
        setPhone("");
      } else {
        setErr(res.error);
      }
    } catch {
      setErr("Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
      <h2 className="sectionTitle">Send by text</h2>
      {disabled ? (
        <p className="muted">Fill the required fields above to enable sending.</p>
      ) : !open ? (
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          Text this document to someone
        </button>
      ) : (
        <div className="card">
          <div className="formGrid">
            <div className="field">
              <label className="label">Recipient name (optional)</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
              />
            </div>
            <div className="field">
              <label className="label">Recipient mobile number</label>
              <input
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(203) 555-0123"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
              />
            </div>
          </div>
          {msg && <p style={{ color: "var(--ok)", marginBottom: 10 }}>{msg}</p>}
          {err && <p style={{ color: "var(--danger)", marginBottom: 10 }}>{err}</p>}
          <div className="btnRow">
            <button
              type="button"
              className="btn btnPrimary"
              disabled={busy || !phone.trim()}
              onClick={submit}
            >
              {busy ? "Sending…" : "Send link"}
            </button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusButton({
  docId,
  complete,
  canComplete,
  dirty,
  saveNow,
}: {
  docId: string;
  complete: boolean;
  canComplete: boolean;
  dirty: boolean;
  saveNow: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={busy || (!complete && !canComplete)}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            // The action validates against the SAVED copy — save edits first.
            if (dirty) await saveNow();
            const res = await setDocumentStatusAction(docId, !complete);
            if (!res.ok) setErr(res.error);
          } catch {
            setErr("Something went wrong — please try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : complete ? "Reopen draft" : "Mark filed"}
      </button>
      {err && <span style={{ color: "var(--danger)", fontSize: 13 }}>{err}</span>}
    </>
  );
}

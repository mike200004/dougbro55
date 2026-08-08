"use client";

import { useMemo, useRef, useState } from "react";
import {
  saveDocumentFieldsAction,
  prepareDocumentTextAction,
  setDocumentStatusAction,
  cancelSignatureRequestAction,
} from "@/app/actions";
import { smsHref, documentTextMessage, signatureTextMessage } from "@/lib/sms-link";
import { reportClientError } from "@/lib/report-error";

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
  signerPhone: string | null;
  signerEmail: string | null;
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
  const [saveError, setSaveError] = useState<string | null>(null);
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

  // `saving` disables BOTH Save and Download/preview, so it must always be
  // released — a transient save failure that skipped setSaving(false) left
  // the whole editor wedged until a full page reload.
  async function save(formData: FormData) {
    setSaving(true);
    setSaveError(null);
    try {
      await saveDocumentFieldsAction(docId, formData);
      setSaved(true);
      setDirty(false);
    } catch (e) {
      reportClientError("editor.save", e, { docId });
      setSaveError("Couldn't save your changes — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  /** Returns false when the save failed, so callers don't act on stale data. */
  async function saveNow(): Promise<boolean> {
    if (!formRef.current) return true;
    setSaving(true);
    setSaveError(null);
    try {
      await saveDocumentFieldsAction(docId, new FormData(formRef.current));
      setSaved(true);
      setDirty(false);
      return true;
    } catch (e) {
      reportClientError("editor.saveNow", e, { docId });
      setSaveError("Couldn't save your changes — check your connection and try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form action={save} ref={formRef}>
        <div className="field">
          <label className="label" htmlFor="doc-title">Document title</label>
          <input
            id="doc-title"
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
                  <label className="label" htmlFor={`f-${f.key}`}>
                    {f.label} {f.required && <span className="req">*</span>}
                  </label>
                  {f.type === "longtext" ? (
                    <textarea
                      id={`f-${f.key}`}
                      className="textarea"
                      name={f.key}
                      value={vals[f.key] ?? ""}
                      disabled={locked}
                      onChange={(e) => update(f.key, e.target.value)}
                    />
                  ) : f.type === "dropdown" ? (
                    <select
                      id={`f-${f.key}`}
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
                      id={`f-${f.key}`}
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
                      id={`f-${f.key}`}
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

        {saveError && <p style={{ color: "var(--danger)", marginBottom: 12 }}>{saveError}</p>}

        <div className="btnRow">
          <button type="submit" className="btn btnPrimary" disabled={saving || locked}>
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={saving}
            onClick={async () => {
              // Don't hand someone a PDF that's missing their latest edits —
              // and don't open a stale one if that save failed.
              if (dirty && !locked && !(await saveNow())) return;
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

      {signatures.length > 0 && <SignatureList docId={docId} docTitle={title} rows={signatures} />}

      {!locked && (
        <>
          {/* A document with no fields at all is a broken import, not a
              ready-to-send document — don't offer to send or sign a blank. */}
          <SendByText docId={docId} disabled={missing.length > 0 || !fields.length} dirty={dirty} saveNow={saveNow} />
          <SendForSignature docId={docId} disabled={missing.length > 0 || !fields.length} dirty={dirty} saveNow={saveNow} />
        </>
      )}
    </>
  );
}

function SignatureList({
  docId,
  docTitle,
  rows,
}: {
  docId: string;
  docTitle: string;
  rows: SignatureRow[];
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);
  return (
    <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
      <h2 className="sectionTitle">Signatures</h2>
      {rowErr && <p style={{ color: "var(--danger)", marginBottom: 10 }}>{rowErr}</p>}
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
                {r.signerEmail && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy === `remind-${r.id}` || copied === `reminded-${r.id}`}
                    onClick={async () => {
                      setBusy(`remind-${r.id}`);
                      setRowErr(null);
                      try {
                        const { remindSignatureAction } = await import("@/app/actions");
                        const res = await remindSignatureAction(r.id, docId);
                        if (res.ok) {
                          setCopied(`reminded-${r.id}`);
                          setTimeout(() => setCopied(null), 4000);
                        } else {
                          // Rate-limited or no-email-on-file must be visible,
                          // not a button that silently springs back.
                          setRowErr(res.error);
                        }
                      } catch {
                        setRowErr("Couldn't send the reminder — please try again.");
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    {busy === `remind-${r.id}`
                      ? "Sending…"
                      : copied === `reminded-${r.id}`
                        ? "Reminder sent ✓"
                        : "Remind"}
                  </button>
                )}
                <a
                  className="btn"
                  href={smsHref(r.signerPhone, signatureTextMessage(docTitle || "a document", r.signUrl, r.signer))}
                  aria-label={`Text the signing link to ${r.signer} from your phone`}
                >
                  Text signer
                </a>
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
  saveNow: () => Promise<boolean>;
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
      // Never send a signature request built on edits that failed to save.
      if (dirty && !(await saveNow())) {
        setErr("Couldn't save your latest edits — fix that first, then send.");
        return;
      }
      const { requestSignatureAction } = await import("@/app/actions");
      const res = await requestSignatureAction({
        docId,
        signerName: name,
        signerEmail: email,
        signerPhone: phone,
      });
      if (res.ok) {
        if (res.delivered === false && res.sign_url) {
          setMsg(
            "Request created. Tap “Text signer” in the Signatures list to send the link from your phone, or copy it below.",
          );
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
              <label className="label" htmlFor="sig-name">Signer’s full name</label>
              <input
                id="sig-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="sig-email">Signer’s email</label>
              <input
                id="sig-email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="sig-phone">…or mobile number</label>
              <input
                id="sig-phone"
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
  saveNow: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<{ url: string; docName: string } | null>(null);
  const [copied, setCopied] = useState<"msg" | "link" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // One roundtrip when the panel opens: save edits, mint the share link. The
  // message itself is composed client-side so the sms: href is always in sync
  // with what's typed — clipboard writes stay synchronous (Safari requires it).
  async function openPanel() {
    setOpen(true);
    setBusy(true);
    setErr(null);
    try {
      if (dirty && !(await saveNow())) {
        setErr("Couldn't save your latest edits — fix that first, then share.");
        return;
      }
      const res = await prepareDocumentTextAction(docId);
      if (res.ok && res.url && res.docName) setPrepared({ url: res.url, docName: res.docName });
      else if (!res.ok) setErr(res.error);
    } catch {
      setErr("Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const message = prepared ? documentTextMessage(prepared.docName, prepared.url, name) : "";

  function copy(kind: "msg" | "link", text: string) {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(kind);
        setTimeout(() => setCopied(null), 2000);
      },
      () => setCopied(null),
    );
  }

  return (
    <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
      <h2 className="sectionTitle">Send by text</h2>
      {disabled ? (
        <p className="muted">Fill the required fields above to enable sending.</p>
      ) : !open ? (
        <>
          <button type="button" className="btn" onClick={openPanel}>
            Text this document to someone
          </button>
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            Sends from your phone — your client sees your number, not ours.
          </p>
        </>
      ) : (
        <div className="card">
          <div className="formGrid">
            <div className="field">
              <label className="label" htmlFor="send-name">Recipient name (optional)</label>
              <input
                id="send-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="send-phone">Recipient mobile (optional)</label>
              <input
                id="send-phone"
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(203) 555-0123"
              />
            </div>
          </div>
          {err && <p style={{ color: "var(--danger)", marginBottom: 10 }}>{err}</p>}
          {busy && <p className="muted" style={{ marginBottom: 10 }}>Preparing your message…</p>}
          {prepared && (
            <>
              <div className="notice noticeInfo" style={{ marginBottom: 12, fontSize: 13 }}>
                {message}
              </div>
              <div className="btnRow" style={{ alignItems: "center", flexWrap: "wrap" }}>
                <a
                  className="btn btnPrimary"
                  href={smsHref(phone, message)}
                  aria-label="Open your Messages app with this text prefilled"
                >
                  Open in Messages
                </a>
                <button type="button" className="btn" onClick={() => copy("msg", message)}>
                  {copied === "msg" ? "Copied ✓" : "Copy message"}
                </button>
                <button type="button" className="btn" onClick={() => copy("link", prepared.url)}>
                  {copied === "link" ? "Copied ✓" : "Copy link"}
                </button>
                <button type="button" className="btn" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
              <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                The text goes out from your phone, so it arrives from your number. On a
                computer where nothing opens, copy the message and send it from any app.
              </p>
            </>
          )}
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
  saveNow: () => Promise<boolean>;
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
            if (dirty && !(await saveNow())) {
              setErr("Couldn't save your latest edits — try again.");
              return;
            }
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

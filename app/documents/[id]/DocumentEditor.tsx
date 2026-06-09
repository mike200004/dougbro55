"use client";

import { useState } from "react";
import {
  saveDocumentFieldsAction,
  sendDocumentAction,
  setDocumentStatusAction,
} from "@/app/actions";

interface FieldDef {
  key: string;
  label: string;
  type: string;
  required: boolean;
  hint: string | null;
  options?: string[] | null;
}

export default function DocumentEditor({
  docId,
  title,
  status,
  fields,
  values,
}: {
  docId: string;
  title: string;
  status: string;
  fields: FieldDef[];
  values: Record<string, string>;
}) {
  const [vals, setVals] = useState<Record<string, string>>(values);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const missing = fields.filter((f) => f.required && !vals[f.key]?.trim());
  const complete = status === "completed";

  function update(key: string, v: string) {
    setVals((p) => ({ ...p, [key]: v }));
    setSaved(false);
  }

  async function save(formData: FormData) {
    setSaving(true);
    await saveDocumentFieldsAction(docId, formData);
    setSaving(false);
    setSaved(true);
  }

  return (
    <form action={save}>
      <div className="field">
        <label className="label">Document title</label>
        <input className="input" name="__title" defaultValue={title} />
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="formGrid">
          {fields.map((f) => (
            <div className="field" key={f.key}>
              <label className="label">
                {f.label} {f.required && <span className="req">*</span>}
              </label>
              {f.type === "longtext" ? (
                <textarea
                  className="textarea"
                  name={f.key}
                  value={vals[f.key] ?? ""}
                  onChange={(e) => update(f.key, e.target.value)}
                />
              ) : f.type === "dropdown" ? (
                <select
                  className="input"
                  name={f.key}
                  value={vals[f.key] ?? ""}
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
                  onChange={(e) => update(f.key, e.target.value)}
                  placeholder={f.hint ?? undefined}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {missing.length > 0 && (
        <p className="muted" style={{ marginBottom: 14 }}>
          Still needed before filing: {missing.map((f) => f.label).join(", ")}
        </p>
      )}

      <div className="btnRow">
        <button type="submit" className="btn btnPrimary" disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
        <a
          className="btn"
          href={`/api/documents/${docId}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Download / preview PDF
        </a>
        <StatusButton docId={docId} complete={complete} canComplete={missing.length === 0} />
      </div>

      <SendByText docId={docId} disabled={missing.length > 0} />
    </form>
  );
}

function SendByText({ docId, disabled }: { docId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">Recipient mobile number</label>
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(203) 555-0123" />
            </div>
          </div>
          {msg && <p style={{ color: "var(--ok)", marginBottom: 10 }}>{msg}</p>}
          {err && <p style={{ color: "var(--danger)", marginBottom: 10 }}>{err}</p>}
          <div className="btnRow">
            <button
              type="button"
              className="btn btnPrimary"
              disabled={busy || !phone.trim()}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                setMsg(null);
                const res = await sendDocumentAction(docId, phone, name);
                setBusy(false);
                if (res.ok) {
                  setMsg(`Sent a link to ${phone}.`);
                  setPhone("");
                } else {
                  setErr(res.error);
                }
              }}
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
}: {
  docId: string;
  complete: boolean;
  canComplete: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      disabled={busy || (!complete && !canComplete)}
      onClick={async () => {
        setBusy(true);
        await setDocumentStatusAction(docId, !complete);
        setBusy(false);
      }}
    >
      {complete ? "Reopen draft" : "Mark filed"}
    </button>
  );
}

"use client";

import { useState } from "react";
import { saveDocumentFieldsAction, setDocumentStatusAction } from "@/app/actions";

interface FieldDef {
  key: string;
  label: string;
  type: string;
  required: boolean;
  hint: string | null;
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
    </form>
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

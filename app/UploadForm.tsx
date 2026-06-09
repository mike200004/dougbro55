"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadFormAction } from "./actions";

export default function UploadForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file") as File | null;
    if (!file || file.size === 0) {
      setError("Choose a PDF to upload.");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    const res = await uploadFormAction(fd);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNote("Form uploaded — its fields are ready to fill.");
    setOpen(false);
    form.reset();
    router.refresh();
  }

  if (!open) {
    return (
      <div>
        {note && <p className="muted" style={{ marginBottom: 10 }}>{note}</p>}
        <button className="btn" onClick={() => setOpen(true)}>
          + Upload a form
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card">
      <div className="field">
        <label className="label">Form name</label>
        <input className="input" name="name" placeholder="e.g. SmartMLS Listing Agreement" />
        <span className="hint">Leave blank to use the file name.</span>
      </div>
      <div className="field">
        <label className="label">PDF file (fillable form)</label>
        <input className="input" type="file" name="file" accept="application/pdf,.pdf" />
      </div>
      {error && <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>}
      <div className="btnRow">
        <button type="submit" className="btn btnPrimary" disabled={busy}>
          {busy ? "Uploading…" : "Upload form"}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

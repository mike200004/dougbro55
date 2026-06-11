"use client";

import { useState } from "react";
import { renameTemplateAction, deleteTemplateAction } from "@/app/actions";

export default function TemplateActions({ templateId, name }: { templateId: string; name: string }) {
  const [busy, setBusy] = useState<"rename" | "delete" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <span style={{ display: "inline-block" }}>
      <span className="btnRow" style={{ gap: 6 }}>
        <button
          type="button"
          className="btnGhost btn"
          style={{ padding: "4px 8px", fontSize: 13 }}
          disabled={busy !== null}
          onClick={async (e) => {
            e.preventDefault();
            const next = prompt("Rename this form:", name);
            if (!next || !next.trim() || next === name) return;
            setBusy("rename");
            setErr(null);
            try {
              await renameTemplateAction(templateId, next);
            } catch {
              setErr("Couldn't rename the form — please try again.");
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === "rename" ? "Renaming…" : "Rename"}
        </button>
        <button
          type="button"
          className="btnGhost btn"
          style={{ padding: "4px 8px", fontSize: 13, color: "var(--danger)" }}
          disabled={busy !== null}
          onClick={async (e) => {
            e.preventDefault();
            if (!confirm(`Delete the form “${name}”?`)) return;
            setBusy("delete");
            setErr(null);
            try {
              const res = await deleteTemplateAction(templateId);
              if (res && !res.ok) setErr(res.error);
            } catch {
              setErr("Couldn't delete the form — please try again.");
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === "delete" ? "Deleting…" : "Delete"}
        </button>
      </span>
      {err && <span style={{ display: "block", color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{err}</span>}
    </span>
  );
}

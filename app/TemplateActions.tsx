"use client";

import { renameTemplateAction, deleteTemplateAction } from "@/app/actions";

export default function TemplateActions({ templateId, name }: { templateId: string; name: string }) {
  return (
    <span className="btnRow" style={{ gap: 6 }}>
      <button
        type="button"
        className="btnGhost btn"
        style={{ padding: "4px 8px", fontSize: 13 }}
        onClick={async (e) => {
          e.preventDefault();
          const next = prompt("Rename this form:", name);
          if (next && next.trim() && next !== name) await renameTemplateAction(templateId, next);
        }}
      >
        Rename
      </button>
      <button
        type="button"
        className="btnGhost btn"
        style={{ padding: "4px 8px", fontSize: 13, color: "var(--danger)" }}
        onClick={async (e) => {
          e.preventDefault();
          if (!confirm(`Delete the form “${name}”? Existing filled copies stay on your dashboard.`)) return;
          await deleteTemplateAction(templateId);
        }}
      >
        Delete
      </button>
    </span>
  );
}

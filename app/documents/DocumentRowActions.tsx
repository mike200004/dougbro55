"use client";

import { useState } from "react";
import {
  archiveDocumentAction,
  deleteDocumentAction,
  duplicateDocumentAction,
} from "@/app/actions";

export default function DocumentRowActions({ docId, archived }: { docId: string; archived: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <span style={{ position: "relative" }}>
      <button className="btn" style={{ padding: "6px 12px" }} onClick={() => setOpen((o) => !o)} aria-label="Actions">
        ⋯
      </button>
      {open && (
        <span
          style={{
            position: "absolute",
            right: 0,
            top: "110%",
            zIndex: 30,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            boxShadow: "var(--shadow-md)",
            display: "flex",
            flexDirection: "column",
            minWidth: 160,
          }}
        >
          <button className="navMobileLink" disabled={busy} onClick={async () => { setBusy(true); await duplicateDocumentAction(docId); }}>
            Duplicate
          </button>
          <button
            className="navMobileLink"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await archiveDocumentAction(docId, !archived);
              setBusy(false);
              setOpen(false);
            }}
          >
            {archived ? "Unarchive" : "Archive"}
          </button>
          <button
            className="navMobileLink"
            style={{ color: "var(--danger)" }}
            disabled={busy}
            onClick={async () => {
              if (!confirm("Permanently delete this document? This can't be undone.")) return;
              setBusy(true);
              await deleteDocumentAction(docId);
              setBusy(false);
              setOpen(false);
            }}
          >
            Delete
          </button>
        </span>
      )}
    </span>
  );
}

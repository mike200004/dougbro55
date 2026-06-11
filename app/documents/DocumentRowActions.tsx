"use client";

import { useEffect, useRef, useState } from "react";
import {
  archiveDocumentAction,
  deleteDocumentAction,
  duplicateDocumentAction,
} from "@/app/actions";

export default function DocumentRowActions({ docId, archived }: { docId: string; archived: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  // Close on outside click / Escape like a real menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function run(task: () => Promise<unknown>, closeAfter = true) {
    setBusy(true);
    setErr(null);
    try {
      const res = (await task()) as { ok?: boolean; error?: string } | undefined;
      if (res && res.ok === false) setErr(res.error ?? "That didn't work — try again.");
      else if (closeAfter) setOpen(false);
    } catch {
      setErr("That didn't work — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ position: "relative" }} ref={ref}>
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
          <button className="navMobileLink" disabled={busy} onClick={() => run(() => duplicateDocumentAction(docId), false)}>
            {busy ? "Working…" : "Duplicate"}
          </button>
          <button className="navMobileLink" disabled={busy} onClick={() => run(() => archiveDocumentAction(docId, !archived))}>
            {archived ? "Unarchive" : "Archive"}
          </button>
          <button
            className="navMobileLink"
            style={{ color: "var(--danger)" }}
            disabled={busy}
            onClick={() => {
              if (!confirm("Permanently delete this document? This can't be undone.")) return;
              void run(() => deleteDocumentAction(docId));
            }}
          >
            Delete
          </button>
          {err && (
            <span style={{ color: "var(--danger)", fontSize: 12, padding: "6px 12px" }}>{err}</span>
          )}
        </span>
      )}
    </span>
  );
}

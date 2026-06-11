"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { uploadFormAction, saveOverlayTemplateAction } from "@/app/actions";

const WORKER = "https://unpkg.com/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";

interface RenderedPage {
  dataUrl: string;
  wPt: number;
  hPt: number;
}
interface PlacedField {
  key: string;
  label: string;
  type: string;
  placement: { page: number; x: number; y: number; size?: number; maxWidth?: number };
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

export default function NewFormPage() {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"pick" | "working" | "review">("pick");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [fields, setFields] = useState<PlacedField[]>([]);
  const dragIdx = useRef<number | null>(null);

  function dragMove(e: React.PointerEvent<HTMLDivElement>, pi: number) {
    if (dragIdx.current === null) return;
    const idx = dragIdx.current;
    if ((fields[idx]?.placement.page ?? 0) !== pi) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fracX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const fracY = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    const pg = pages[pi];
    const x = Math.round(fracX * pg.wPt);
    const y = Math.round(pg.hPt - fracY * pg.hPt);
    setFields((fs) => fs.map((f, j) => (j === idx ? { ...f, placement: { ...f.placement, x, y } } : f)));
  }

  async function analyze() {
    if (!file) {
      setError("Choose a PDF first.");
      return;
    }
    setError(null);
    setStage("working");
    try {
      const buf = await file.arrayBuffer();

      setStatus("Reading the form…");
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = WORKER;
      const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise;

      // Fillable (AcroForm)? Let the server detect + save directly.
      const fieldObjects = await doc.getFieldObjects().catch(() => null);
      if (fieldObjects && Object.keys(fieldObjects).length > 0) {
        setStatus("This form is already fillable — saving…");
        const fd = new FormData();
        fd.append("file", file);
        fd.append("name", name);
        const res = await uploadFormAction(fd);
        if (res.ok) {
          window.location.assign("/");
          return;
        }
        if (!("flat" in res) || !res.flat) {
          setError(res.error);
          setStage("pick");
          return;
        }
        // server disagreed → fall through to flat flow
      }

      // Flat / scanned → render pages and detect fields with vision.
      setStatus("Rendering pages…");
      const rendered: RenderedPage[] = [];
      const n = Math.min(doc.numPages, 6);
      for (let i = 1; i <= n; i++) {
        const page = await doc.getPage(i);
        const vp1 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        rendered.push({ dataUrl: canvas.toDataURL("image/png"), wPt: vp1.width, hPt: vp1.height });
      }
      setPages(rendered);

      setStatus("Finding the fields (AI)…");
      const res = await fetch("/api/forms/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pages: rendered.map((p) => ({ image: p.dataUrl, width: p.wPt, height: p.hPt })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't analyze the form.");
        setStage("pick");
        return;
      }
      setFields(data.fields || []);
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong reading the PDF.");
      setStage("pick");
    }
  }

  async function save() {
    if (!file) return;
    setStage("working");
    setStatus("Saving your form…");
    const buf = await file.arrayBuffer();
    const res = await saveOverlayTemplateAction({
      name: name || file.name.replace(/\.pdf$/i, ""),
      pdfBase64: toBase64(buf),
      fields,
    });
    if (res.ok) {
      window.location.assign("/");
      return;
    }
    setError(res.error);
    setStage("review");
  }

  return (
    <div className="stack">
      <div>
        <Link href="/" className="backlink">← Dashboard</Link>
        <h1 className="pageTitle" style={{ marginTop: 10 }}>Upload a form</h1>
        <p className="pageSub">
          Upload any PDF — a SmartMLS form, a brokerage document, a disclosure. If it’s
          fillable, Pheme reads its fields automatically. If it’s flat or scanned, Pheme finds
          the blanks for you to confirm, then saves it as a reusable form.
        </p>
      </div>

      {error && <div className="notice">{error}</div>}

      {stage !== "review" && (
        <div className="card">
          <div className="field">
            <label className="label">Form name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SmartMLS Listing Agreement" />
          </div>
          <div className="field">
            <label className="label">PDF file</label>
            <input
              className="input"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <button className="btn btnPrimary" onClick={analyze} disabled={stage === "working" || !file}>
            {stage === "working" ? status || "Working…" : "Analyze form"}
          </button>
        </div>
      )}

      {stage === "review" && (
        <>
          <div className="card">
            <h2 className="sectionTitle">Fields Pheme found ({fields.length})</h2>
            <p className="muted" style={{ marginBottom: 14 }}>
              Rename anything that’s off, or remove a field. The markers on the pages below show
              where each value will print.
            </p>
            {fields.map((f, i) => (
              <div key={f.key} className="row" style={{ gap: 10 }}>
                <span className="badge">{i + 1}</span>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={f.label}
                  onChange={(e) =>
                    setFields((fs) => fs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                />
                <span className="muted" style={{ fontSize: 12 }}>p.{(f.placement.page ?? 0) + 1}</span>
                <button className="btn btnDanger" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            ))}
            <div className="btnRow" style={{ marginTop: 18 }}>
              <button className="btn btnPrimary" onClick={save}>Save form</button>
              <button className="btn" onClick={() => setStage("pick")}>Start over</button>
            </div>
          </div>

          <p className="muted" style={{ textAlign: "center" }}>
            The numbered markers show where each value will print. <strong>Drag any marker</strong> to fine-tune it.
          </p>
          {pages.map((p, pi) => (
            <div
              key={pi}
              onPointerMove={(e) => dragMove(e, pi)}
              onPointerUp={() => (dragIdx.current = null)}
              onPointerLeave={() => (dragIdx.current = null)}
              style={{ position: "relative", maxWidth: 720, margin: "0 auto", touchAction: "none" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.dataUrl} alt={`Page ${pi + 1}`} draggable={false} style={{ width: "100%", display: "block", border: "1px solid var(--border)", borderRadius: 6 }} />
              {fields
                .map((f, idx) => ({ f, idx }))
                .filter(({ f }) => (f.placement.page ?? 0) === pi)
                .map(({ f, idx }) => (
                  <span
                    key={f.key}
                    title={`${f.label} — drag to move`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      dragIdx.current = idx;
                    }}
                    style={{
                      position: "absolute",
                      left: `${(f.placement.x / p.wPt) * 100}%`,
                      top: `${((p.hPt - f.placement.y) / p.hPt) * 100}%`,
                      transform: "translate(-2px, -100%)",
                      background: "var(--brand)",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 4,
                      padding: "1px 6px",
                      cursor: "grab",
                      userSelect: "none",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                    }}
                  >
                    {idx + 1}
                  </span>
                ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

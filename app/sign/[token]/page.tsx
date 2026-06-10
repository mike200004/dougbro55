"use client";

import { use, useEffect, useRef, useState } from "react";

interface Info {
  status: string;
  signer_name: string;
  document_title: string;
  consent_text: string;
}

export default function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"signed" | "declined" | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    fetch(`/api/sign/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setInfo(d);
          setName(d.signer_name || "");
          if (d.status !== "pending") setDone(d.status === "signed" ? "signed" : "declined");
        }
      })
      .catch(() => setError("Couldn't load this signing request."));
  }, [token]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = e.currentTarget.width / rect.width;
    const scaleY = e.currentTarget.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1b2b44";
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasInk.current = true;
  }
  function clearPad() {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    hasInk.current = false;
  }

  async function submit(action: "sign" | "decline") {
    setBusy(true);
    setError(null);
    const signaturePng =
      action === "sign" && hasInk.current ? canvasRef.current!.toDataURL("image/png") : undefined;
    const res = await fetch(`/api/sign/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, name, consent, signaturePng }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }
    setDone(data.status);
  }

  if (error && !info) {
    return <div className="notice" style={{ maxWidth: 560, margin: "60px auto" }}>{error}</div>;
  }
  if (!info) return <p className="muted" style={{ textAlign: "center", marginTop: 80 }}>Loading…</p>;

  if (done === "signed") {
    return (
      <div className="authWrap" style={{ textAlign: "center" }}>
        <h1 className="pageTitle">You’re all set ✓</h1>
        <p className="pageSub" style={{ margin: "12px auto 24px" }}>
          “{info.document_title}” has been signed. A copy was emailed to you if we have your
          email on file.
        </p>
        <a className="btn" href={`/api/sign/${token}?pdf=1`} target="_blank" rel="noreferrer">
          View the signed document
        </a>
      </div>
    );
  }
  if (done === "declined") {
    return (
      <div className="authWrap" style={{ textAlign: "center" }}>
        <h1 className="pageTitle">Request declined</h1>
        <p className="pageSub">The sender has been notified.</p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 760, margin: "0 auto" }}>
      <div>
        <h1 className="pageTitle">Sign “{info.document_title}”</h1>
        <p className="pageSub">
          Review the document, then sign below. It takes less than a minute.
        </p>
      </div>

      <iframe
        src={`/api/sign/${token}?pdf=1`}
        title="Document preview"
        style={{
          width: "100%",
          height: 460,
          border: "1px solid var(--border)",
          borderRadius: 6,
          background: "#fff",
        }}
      />

      <div className="card">
        <div className="field">
          <label className="label">
            Your full legal name <span className="req">*</span>
          </label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field">
          <label className="label">Draw your signature (optional — we’ll use your typed name otherwise)</label>
          <canvas
            ref={canvasRef}
            width={520}
            height={140}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={() => (drawing.current = false)}
            onPointerLeave={() => (drawing.current = false)}
            style={{
              width: "100%",
              height: 140,
              border: "1px dashed var(--border-strong)",
              borderRadius: 6,
              background: "#fff",
              touchAction: "none",
              cursor: "crosshair",
            }}
          />
          <button type="button" className="btnGhost btn" style={{ alignSelf: "flex-start", marginTop: 6 }} onClick={clearPad}>
            Clear
          </button>
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16, fontSize: 13, color: "var(--muted)", cursor: "pointer" }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
          <span>{info.consent_text}</span>
        </label>

        {error && <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>}

        <div className="btnRow">
          <button className="btn btnPrimary btnLg" disabled={busy || !name.trim() || !consent} onClick={() => submit("sign")}>
            {busy ? "Signing…" : "Sign document"}
          </button>
          <button className="btn btnDanger" disabled={busy} onClick={() => submit("decline")}>
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

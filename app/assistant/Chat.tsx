"use client";

import { useRef, useState } from "react";

interface UiMessage {
  role: "user" | "assistant";
  text: string;
}

// Plain text transcript turns exchanged with /api/chat.
type ApiMessage = { role: "user" | "assistant"; content: string };

export default function Chat() {
  const [ui, setUi] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiMessages = useRef<ApiMessage[]>([]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError(null);
    setUi((m) => [...m, { role: "user", text }]);
    apiMessages.current = [...apiMessages.current, { role: "user", content: text }];
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages.current }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
      } else {
        apiMessages.current = data.messages;
        setUi((m) => [...m, { role: "assistant", text: data.reply || "(no response)" }]);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        className="card"
        style={{ minHeight: 320, display: "flex", flexDirection: "column", gap: 14 }}
      >
        {ui.length === 0 && (
          <p className="muted">Start the conversation below.</p>
        )}
        {ui.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "80%",
              background:
                m.role === "user" ? "rgba(79,140,255,0.18)" : "rgba(255,255,255,0.05)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: "10px 14px",
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
            }}
          >
            {m.text}
          </div>
        ))}
        {busy && <div className="muted" style={{ alignSelf: "flex-start" }}>Thinking…</div>}
      </div>

      {error && <p style={{ color: "var(--danger)", marginTop: 10 }}>{error}</p>}

      <div className="btnRow" style={{ marginTop: 16 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="Ask the assistant…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={busy}
        />
        <button className="btn btnPrimary" onClick={send} disabled={busy || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

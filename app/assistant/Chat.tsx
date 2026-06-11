"use client";

import { useEffect, useRef, useState } from "react";

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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [ui, busy]);

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
        // Roll the failed turn back so retrying doesn't double the message.
        apiMessages.current = apiMessages.current.slice(0, -1);
        setInput(text);
        setError(data.error || "Something went wrong — your message wasn't sent.");
      } else {
        apiMessages.current = data.messages;
        setUi((m) => [...m, { role: "assistant", text: data.reply || "(no response)" }]);
      }
    } catch {
      apiMessages.current = apiMessages.current.slice(0, -1);
      setInput(text);
      setError("Network error — your message wasn't sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        className="card"
        style={{ minHeight: 320, maxHeight: "60vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}
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
              background: m.role === "user" ? "var(--brand-tint)" : "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              borderRadius: 8,
              padding: "10px 14px",
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
            }}
          >
            {m.text}
          </div>
        ))}
        {busy && <div className="muted" style={{ alignSelf: "flex-start" }}>Thinking…</div>}
        <div ref={bottomRef} />
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

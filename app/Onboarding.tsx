"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Props {
  phone: string; // the Pheme number
  hasDoc: boolean;
  hasTemplate: boolean;
  hasTeam: boolean;
}

export default function Onboarding({ phone, hasDoc, hasTemplate, hasTeam }: Props) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem("pheme-onboarding-dismissed") === "1");
  }, []);

  const steps = [
    {
      done: true,
      label: "Create your account",
      detail: "Done — welcome aboard.",
    },
    {
      done: hasDoc,
      label: `Call or text ${phone} and file your first document`,
      detail: "Say something like “Start a dual agency for 12 Oak St…” — Pheme does the rest.",
    },
    {
      done: hasTemplate,
      label: "Upload one of your own forms",
      detail: (
        <>
          A SmartMLS form, a disclosure, your brokerage’s paperwork — <Link href="/forms/new">upload it once</Link> and fill it forever.
        </>
      ),
    },
    {
      done: hasTeam,
      label: "Invite your assistant",
      detail: (
        <>
          They get their own login and phone — everything lands in your account. <Link href="/settings">Settings → Team</Link>.
        </>
      ),
    },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  if (dismissed || remaining === 0) return null;

  return (
    <div className="card" style={{ borderLeft: "3px solid var(--gold)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 className="cardTitle" style={{ margin: 0 }}>Getting started</h2>
        <button
          className="btnGhost btn"
          style={{ padding: "4px 8px" }}
          onClick={() => {
            localStorage.setItem("pheme-onboarding-dismissed", "1");
            setDismissed(true);
          }}
        >
          Dismiss
        </button>
      </div>
      <div style={{ marginTop: 12 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", alignItems: "flex-start" }}>
            <span
              className="badge"
              style={s.done ? { background: "var(--ok-tint)", color: "var(--ok)", borderColor: "#b7e0c6" } : undefined}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <div>
              <div style={{ fontWeight: 700, textDecoration: s.done ? "line-through" : "none", opacity: s.done ? 0.6 : 1 }}>
                {s.label}
              </div>
              {!s.done && <div className="rowSub">{s.detail}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

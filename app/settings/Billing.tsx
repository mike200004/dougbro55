"use client";

import { useState } from "react";
import { startCheckoutAction, openBillingPortalAction } from "@/app/actions";

interface Props {
  plan: "beta" | "trial" | "pro" | "expired";
  daysLeft?: number;
  hasCustomer: boolean;
}

export default function Billing({ plan, daysLeft, hasCustomer }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const label =
    plan === "beta"
      ? "Free — early access"
      : plan === "pro"
        ? "Pheme Pro"
        : plan === "trial"
          ? `Free trial — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
          : "Trial ended";

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="rowMain">{label}</div>
          <div className="rowSub">
            {plan === "beta"
              ? "Everything is included while Pheme is in early access."
              : plan === "pro"
                ? "Unlimited documents, forms, e-signatures, and team members."
                : "Upgrade to keep filing documents, sending e-signatures, and using the phone assistant."}
          </div>
        </div>
        <div className="btnRow">
          {(plan === "trial" || plan === "expired") && (
            <button
              className="btn btnPrimary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                const res = await startCheckoutAction();
                setBusy(false);
                if (res.ok && res.url) window.location.assign(res.url);
                else setErr(res.ok ? null : res.error);
              }}
            >
              {busy ? "Opening…" : "Upgrade"}
            </button>
          )}
          {hasCustomer && (
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const res = await openBillingPortalAction();
                setBusy(false);
                if (res.ok && res.url) window.location.assign(res.url);
                else setErr(res.ok ? null : res.error);
              }}
            >
              Manage billing
            </button>
          )}
        </div>
      </div>
      {err && <p style={{ color: "var(--danger)", marginTop: 10 }}>{err}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { startCheckoutAction, openBillingPortalAction } from "@/app/actions";
import type { PlanKey } from "@/lib/types";

interface PlanOption {
  key: PlanKey;
  name: string;
  monthlyUsd: number;
  annualUsd: number;
  minutes: number;
  seats: number;
  overageCentsPerMin: number;
  blurb: string;
}

interface Props {
  plan: "beta" | "trial" | PlanKey | "expired";
  active: boolean;
  trialDaysLeft?: number;
  cancelAtPeriodEnd?: boolean;
  periodEnd?: string | null;
  usedMinutes: number;
  includedMinutes: number | null; // null = unlimited (beta)
  overageAllowed: boolean;
  overageCentsPerMin: number;
  hasCustomer: boolean;
  isOwner: boolean;
  stripeReady: boolean;
  plans: PlanOption[];
  notice?: "success" | "canceled" | "inactive";
}

const label: Record<string, string> = {
  beta: "Free — early access",
  trial: "Free trial",
  solo: "Pheme Solo",
  pro: "Pheme Pro",
  brokerage: "Pheme Brokerage",
  expired: "Trial ended",
};

export default function Billing(props: Props) {
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [switched, setSwitched] = useState<string | null>(null);

  const isPaid = props.plan === "solo" || props.plan === "pro" || props.plan === "brokerage";
  const pct =
    props.includedMinutes && props.includedMinutes > 0
      ? Math.min(100, Math.round((props.usedMinutes / props.includedMinutes) * 100))
      : 0;

  async function checkout(plan: PlanKey) {
    setBusy(plan);
    setErr(null);
    setSwitched(null);
    const res = await startCheckoutAction(plan, billingInterval);
    if (res.ok && res.url) {
      window.location.assign(res.url); // new subscription → Stripe Checkout
      return;
    }
    if (res.ok) {
      // Existing subscription switched in place — no redirect, just confirm
      // and refresh so the webhook-synced plan shows up.
      setSwitched(res.message ?? "Plan updated.");
      setBusy(null);
      setTimeout(() => window.location.reload(), 3500);
      return;
    }
    setErr(res.error);
    setBusy(null);
  }

  async function portal() {
    setBusy("portal");
    setErr(null);
    const res = await openBillingPortalAction();
    if (res.ok && res.url) window.location.assign(res.url);
    else {
      setErr(res.ok ? "Could not open billing." : res.error);
      setBusy(null);
    }
  }

  return (
    <section>
      <h2 className="sectionTitle">Plan &amp; billing</h2>

      {props.notice === "success" && (
        <div className="notice noticeOk" style={{ marginBottom: 14 }}>
          You’re all set — thanks for subscribing to Pheme. Your plan is active.
        </div>
      )}
      {props.notice === "canceled" && (
        <div className="notice" style={{ marginBottom: 14 }}>
          Checkout canceled — no charge was made.
        </div>
      )}
      {props.notice === "inactive" && (
        <div className="notice" style={{ marginBottom: 14 }}>
          Your plan isn’t active, so document filing and the phone assistant are paused. Pick a plan below to switch it back on.
        </div>
      )}

      {/* Current status */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="rowMain">
              {label[props.plan] ?? "Your plan"}
              {props.plan === "trial" && typeof props.trialDaysLeft === "number"
                ? ` — ${props.trialDaysLeft} day${props.trialDaysLeft === 1 ? "" : "s"} left`
                : ""}
            </div>
            <div className="rowSub">
              {props.plan === "beta"
                ? "Every feature included while Pheme is in early access."
                : !props.active
                  ? "Paused — pick a plan to switch filing and the phone assistant back on."
                  : props.cancelAtPeriodEnd && props.periodEnd
                    ? `Cancels on ${new Date(props.periodEnd).toLocaleDateString()}.`
                    : "Unlimited documents, uploads, e-signatures, and texts."}
            </div>
          </div>
          {props.isOwner && props.hasCustomer && (
            <button className="btn" disabled={busy === "portal"} onClick={portal}>
              {busy === "portal" ? "Opening…" : "Manage billing"}
            </button>
          )}
        </div>

        {/* Voice usage meter */}
        {props.includedMinutes !== null && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span className="rowSub">Voice minutes this cycle</span>
              <span className="rowSub">
                {props.usedMinutes} / {props.includedMinutes}
                {props.overageAllowed && props.usedMinutes > props.includedMinutes
                  ? ` (+${props.usedMinutes - props.includedMinutes} billed)`
                  : ""}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 6, background: "var(--line, #e7ded2)", overflow: "hidden" }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: pct >= 100 ? "var(--danger, #b4402f)" : "var(--ink, #1f2937)",
                  transition: "width .3s",
                }}
              />
            </div>
            {props.overageAllowed && (
              <div className="hint" style={{ marginTop: 6 }}>
                Extra minutes bill at ${(props.overageCentsPerMin / 100).toFixed(2)}/min on your next invoice.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Plan picker — hidden on beta (Stripe not configured) */}
      {props.stripeReady && props.isOwner && (
        <>
          {switched && (
            <div className="notice noticeOk" style={{ marginBottom: 14 }} role="status">
              {switched}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span className="rowSub">Billing</span>
            <div className="btnRow" aria-label="Billing interval">
              <button
                className={`btn ${billingInterval === "month" ? "btnPrimary" : ""}`}
                aria-pressed={billingInterval === "month"}
                onClick={() => setBillingInterval("month")}
              >
                Monthly
              </button>
              <button
                className={`btn ${billingInterval === "year" ? "btnPrimary" : ""}`}
                aria-pressed={billingInterval === "year"}
                onClick={() => setBillingInterval("year")}
              >
                Annual · 2 months free
              </button>
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
            {props.plans.map((p) => {
              const price = billingInterval === "year" ? p.annualUsd : p.monthlyUsd;
              const current = props.plan === p.key && props.active;
              return (
                <div key={p.key} className="card" style={current ? { borderColor: "var(--ink, #1f2937)", borderWidth: 2 } : undefined}>
                  <div className="cardKicker">{p.blurb}</div>
                  <div className="cardTitle" style={{ fontSize: 22, margin: "6px 0 2px" }}>{p.name}</div>
                  <div style={{ fontSize: 30, fontWeight: 700 }}>
                    ${price}
                    <span style={{ fontSize: 14, fontWeight: 400 }} className="rowSub">
                      /{billingInterval === "year" ? "yr" : "mo"}
                    </span>
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, margin: "12px 0", fontSize: 14, lineHeight: 1.9 }}>
                    <li>✓ {p.minutes.toLocaleString()} voice minutes / mo</li>
                    <li>✓ {p.seats} team seat{p.seats === 1 ? "" : "s"}</li>
                    <li>✓ Unlimited documents &amp; e-sign</li>
                    <li className="rowSub">Overage ${(p.overageCentsPerMin / 100).toFixed(2)}/min</li>
                  </ul>
                  <button
                    className={`btn ${current ? "" : "btnPrimary"}`}
                    style={{ width: "100%" }}
                    disabled={busy === p.key || current}
                    onClick={() => checkout(p.key)}
                  >
                    {current ? "Current plan" : busy === p.key ? "Opening…" : isPaid ? "Switch plan" : "Choose plan"}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {err && <p style={{ color: "var(--danger)", marginTop: 12 }}>{err}</p>}
      {!props.isOwner && (
        <div className="card">
          <p className="muted">Only the account owner can manage the plan and billing.</p>
        </div>
      )}
    </section>
  );
}

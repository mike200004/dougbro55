import Link from "next/link";
import type { Metadata } from "next";
import { PLANS, TRIAL_DAYS, TRIAL_MINUTES } from "@/lib/billing";

export const metadata: Metadata = {
  title: "Pricing — Pheme",
  description:
    "Simple plans for real-estate agents and brokerages. Every plan includes AI voice-assistant minutes, unlimited documents, e-signatures, and texts. Start with a free trial.",
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "Why are plans priced around voice minutes?",
    a: "The AI phone assistant is the expensive part to run — a single call can go 30–40 minutes of live speech, transcription, and reasoning. Everything else (documents, uploads, e-signatures, texts, the web assistant) is unlimited on every plan. You only ever pay for what actually costs us: talk time.",
  },
  {
    q: "What happens if I go over my minutes?",
    a: "On a paid plan, extra minutes simply bill at your plan's per-minute rate on your next invoice — calls never cut off mid-sentence. If you regularly go over, moving up a plan is cheaper than paying overage.",
  },
  {
    q: "Is there a free trial?",
    a: `Yes — every new account gets ${TRIAL_DAYS} days and ${TRIAL_MINUTES} voice minutes free, with unlimited documents, uploads, and e-signatures. No credit card to start.`,
  },
  {
    q: "Can I change or cancel anytime?",
    a: "Anytime, from Settings → Plan & billing. Upgrades take effect immediately; downgrades and cancellations take effect at the end of your billing period. Your documents and client book always stay with you.",
  },
];

export default function PricingPage() {
  return (
    <div className="stack">
      <header style={{ textAlign: "center" }}>
        <h1 className="pageTitle">Plans that scale with your talk time</h1>
        <p className="pageSub" style={{ maxWidth: 620, margin: "10px auto 0" }}>
          Documents, uploads, e-signatures, and texts are unlimited on every plan. You pick a
          plan based on how much you’ll actually talk to your AI assistant. Start free for{" "}
          {TRIAL_DAYS} days.
        </p>
      </header>

      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", maxWidth: 980, margin: "0 auto", width: "100%" }}
      >
        {PLANS.map((p) => (
          <div
            key={p.key}
            className="card"
            style={p.key === "pro" ? { borderColor: "var(--ink, #1f2937)", borderWidth: 2 } : undefined}
          >
            {p.key === "pro" && <div className="cardKicker">Most popular</div>}
            <div className="cardTitle" style={{ fontSize: 24, margin: "4px 0 2px" }}>{p.name}</div>
            <div className="rowSub" style={{ marginBottom: 10 }}>{p.blurb}</div>
            <div style={{ fontSize: 38, fontWeight: 700 }}>
              ${p.monthlyUsd}
              <span style={{ fontSize: 15, fontWeight: 400 }} className="rowSub">/mo</span>
            </div>
            <div className="rowSub" style={{ marginBottom: 14 }}>
              or ${p.annualUsd}/yr — two months free
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 18px", fontSize: 14.5, lineHeight: 2 }}>
              <li>✓ <strong>{p.minutes.toLocaleString()}</strong> AI voice minutes / month</li>
              <li>✓ {p.seats} team seat{p.seats === 1 ? "" : "s"}</li>
              <li>✓ Unlimited documents &amp; uploads</li>
              <li>✓ Unlimited e-signatures &amp; texts</li>
              <li>✓ Client memory &amp; recall</li>
              <li className="rowSub">Extra minutes ${(p.overageCentsPerMin / 100).toFixed(2)}/min</li>
            </ul>
            <Link href="/signup" className={`btn btnLg ${p.key === "pro" ? "btnPrimary" : ""}`} style={{ width: "100%", textAlign: "center" }}>
              Start free trial
            </Link>
          </div>
        ))}
      </div>

      <p className="muted" style={{ textAlign: "center" }}>
        Prices in USD. Overage minutes are billed on your next invoice. Need more than Brokerage,
        or a multi-office plan? <Link href="/signup">Create an account</Link> and reach out.
      </p>

      <section style={{ maxWidth: 720, margin: "8px auto 0", width: "100%" }}>
        <h2 className="sectionHeading" style={{ textAlign: "center" }}>Questions, answered</h2>
        {FAQ.map((item) => (
          <details key={item.q} className="card" style={{ marginBottom: 10, padding: "16px 20px" }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, fontFamily: "var(--font-serif), Georgia, serif", color: "var(--ink)" }}>
              {item.q}
            </summary>
            <p className="cardBody" style={{ marginTop: 10 }}>{item.a}</p>
          </details>
        ))}
      </section>

      <section className="ctaBand">
        <h2 className="ctaTitle">Try it on your next deal.</h2>
        <p className="ctaSub">Free for {TRIAL_DAYS} days — no credit card to start.</p>
        <Link href="/signup" className="btn btnLg ctaButton">Create your account</Link>
      </section>
    </div>
  );
}

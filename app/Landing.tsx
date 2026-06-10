import Link from "next/link";
import Image from "next/image";

const STEPS = [
  {
    n: "1",
    title: "Upload it or call it in",
    body: "Send Pheme a SmartMLS form, a contract, or any document — or just call your Pheme number from the road.",
  },
  {
    n: "2",
    title: "Talk it through",
    body: "Describe the deal in plain words. Pheme fills every field, and it already knows your clients.",
  },
  {
    n: "3",
    title: "File, send & sign",
    body: "Download the finished PDF, text or email it anywhere, or send it out for e-signature — all from the same conversation.",
  },
];

const FAQ = [
  {
    q: "What forms can Pheme fill?",
    a: "Three Connecticut staples are built in (SmartMLS purchase agreement, buyer representation, dual agency consent) — and you can upload any of your own PDFs. Fillable forms are read automatically; flat or scanned forms get AI field detection you can fine-tune once, then reuse forever.",
  },
  {
    q: "How does the phone assistant know it's me?",
    a: "Caller ID. Your registered mobile (and your assistant's) maps to your account — call or text from it and Pheme already knows who you are, your brokerage details, and your clients.",
  },
  {
    q: "Are the e-signatures legally valid?",
    a: "Pheme captures ESIGN/UETA-style consent, the signature, and a full audit trail (signer, timestamp, IP, document fingerprint) on a certificate page attached to the executed PDF. As with any tool, check your brokerage's policies for your use case.",
  },
  {
    q: "What does it cost?",
    a: "Pheme is free during early access — every feature included. Paid plans will come later, with plenty of notice.",
  },
  {
    q: "Can my assistant use it too?",
    a: "Yes — invite them from Settings. They get their own login and phone number, everything they do lands in your account, and you can see who did what.",
  },
];

const FEATURES = [
  {
    title: "Any document — not just templates",
    body: "Upload a SmartMLS purchase agreement, a buyer rep, a listing form, a disclosure, or your brokerage’s own paperwork. Pheme reads it and fills it out.",
  },
  {
    title: "Hands-free, from anywhere",
    body: "Call or text (475) 270-3374 from the car, a showing, or the closing table. No app to open, no fields to thumb-type.",
  },
  {
    title: "It remembers your clients",
    body: "Mention the Johnsons once — Pheme recalls their names, the property, and their preferences on every future document.",
  },
  {
    title: "Send in seconds",
    body: "Text or email the finished PDF to a client, attorney, or the other agent — or to yourself — right from the same conversation.",
  },
  {
    title: "E-signatures built in",
    body: "Say “send it to Bob for signature.” The signer gets a secure link, signs on their phone, and the executed copy lands back with you — with a full audit trail.",
  },
  {
    title: "Bring your team",
    body: "Add an assistant with their own login and phone number. Everything they do flows into your account — and you see who did what.",
  },
  {
    title: "Built for Connecticut",
    body: "Pheme speaks CT real estate — SmartMLS contracts, buyer representation, dual agency consent (Public Act 96-159), and more.",
  },
];

export default function Landing() {
  return (
    <div>
      <section className="hero">
        <div className="heroLogo">
          <Image
            src="/pheme-mark.png"
            alt="Pheme — Voice that carries."
            width={1402}
            height={1122}
            priority
          />
        </div>
        <h1 className="heroTitle">Real estate paperwork, off your plate.</h1>
        <p className="heroSub">
          Upload any document — a SmartMLS purchase agreement, a buyer rep, a disclosure —
          and Pheme fills it out for you by voice, text, or web. Built for Connecticut
          agents who’d rather be selling than typing.
        </p>
        <div className="heroCtas">
          <Link href="/signup" className="btn btnPrimary btnLg">
            Get started free
          </Link>
          <Link href="/login" className="btn btnLg">
            Sign in
          </Link>
        </div>
      </section>

      <div className="phoneCallout">
        <div className="sub">Call or text your assistant anytime</div>
        <div className="num">(475) 270-3374</div>
      </div>

      <h2 className="sectionHeading">From deal to done in three steps</h2>
      <div className="steps">
        {STEPS.map((s) => (
          <div className="step" key={s.n}>
            <div className="stepNum">{s.n}</div>
            <div className="featureTitle">{s.title}</div>
            <div className="featureBody">{s.body}</div>
          </div>
        ))}
      </div>

      <h2 className="sectionHeading">Everything an agent needs</h2>
      <div className="featureGrid">
        {FEATURES.map((f) => (
          <div className="feature" key={f.title}>
            <div className="featureTitle">{f.title}</div>
            <div className="featureBody">{f.body}</div>
          </div>
        ))}
      </div>

      <h2 className="sectionHeading">Simple pricing</h2>
      <div className="card" style={{ maxWidth: 560, margin: "0 auto", textAlign: "center", padding: 32 }}>
        <div className="cardKicker">Early access</div>
        <div className="cardTitle" style={{ fontSize: 40, margin: "10px 0 4px" }}>Free</div>
        <p className="cardBody" style={{ marginBottom: 18 }}>
          Every feature included while Pheme is in early access — unlimited documents, form
          uploads, e-signatures, client memory, and your team. Paid plans come later, with
          plenty of notice.
        </p>
        <Link href="/signup" className="btn btnPrimary btnLg">Claim your account</Link>
      </div>

      <h2 className="sectionHeading">Questions, answered</h2>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {FAQ.map((item) => (
          <details key={item.q} className="card" style={{ marginBottom: 10, padding: "16px 20px" }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, fontFamily: "var(--font-serif), Georgia, serif", color: "var(--ink)" }}>
              {item.q}
            </summary>
            <p className="cardBody" style={{ marginTop: 10 }}>{item.a}</p>
          </details>
        ))}
      </div>

      <section className="ctaBand">
        <h2 className="ctaTitle">Stop typing forms in the car.</h2>
        <p className="ctaSub">
          Join the Connecticut agents who let Pheme handle the paperwork.
        </p>
        <Link href="/signup" className="btn btnLg ctaButton">
          Create your account
        </Link>
      </section>
    </div>
  );
}

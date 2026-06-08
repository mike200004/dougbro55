import Link from "next/link";
import Image from "next/image";

const FEATURES = [
  {
    title: "Fill CT forms by voice or text",
    body: "Call or text your number and talk it through — Buyer Rep, Purchase Agreement, and Dual Agency Consent get filled out for you, hands-free.",
  },
  {
    title: "It remembers your clients",
    body: "Every form teaches it your book of business. Next time you mention the Johnsons, it already knows who they are, the property, and their preferences.",
  },
  {
    title: "Send documents in seconds",
    body: "Text a client, attorney, or the other agent a secure link to the finished PDF — straight from the same conversation.",
  },
  {
    title: "Add your assistant",
    body: "Bring on a team member with their own login and phone number. Everything they do flows into your account, and you see who did what.",
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
        <h1 className="heroTitle">Your paperwork, handled — by phone, text, or web.</h1>
        <p className="heroSub">
          Pheme is the assistant for Connecticut real estate agents. Fill, file, and
          send your standard documents in the time it takes to describe the deal.
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

      <h2 className="sectionHeading">Everything an agent needs, in one place</h2>
      <div className="featureGrid">
        {FEATURES.map((f) => (
          <div className="feature" key={f.title}>
            <div className="featureTitle">{f.title}</div>
            <div className="featureBody">{f.body}</div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center", margin: "52px 0 8px" }}>
        <Link href="/signup" className="btn btnPrimary btnLg">
          Create your account
        </Link>
      </div>
    </div>
  );
}

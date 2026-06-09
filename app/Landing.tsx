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
    title: "File it & send it",
    body: "Download the finished PDF or text it to your client, attorney, or co-agent in seconds.",
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
    body: "Text a client, attorney, or the other agent a secure link to the finished PDF, right from the same conversation.",
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

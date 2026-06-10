export const metadata = { title: "Terms of Service — Pheme" };

export default function TermsPage() {
  return (
    <div className="stack" style={{ maxWidth: 760, margin: "0 auto" }}>
      <h1 className="pageTitle">Terms of Service</h1>
      <p className="muted">Last updated: June 9, 2026</p>
      <div className="card" style={{ lineHeight: 1.7 }}>
        <p style={{ marginBottom: 14 }}>
          Pheme (“we”, “us”) provides software that helps real estate professionals prepare,
          fill, deliver, and electronically sign documents by web, phone, and text. By
          creating an account or using pheme.deals you agree to these terms.
        </p>
        <h3 className="cardTitle">Your account</h3>
        <p style={{ marginBottom: 14 }}>
          You’re responsible for the accuracy of the information you provide, for activity
          that happens under your account (including team members you invite), and for
          keeping your credentials secure. The phone numbers you register identify callers to
          your account — keep them current.
        </p>
        <h3 className="cardTitle">Documents & e-signatures</h3>
        <p style={{ marginBottom: 14 }}>
          Pheme prepares documents from information you supply and facilitates electronic
          signatures with the signer’s consent, consistent with the U.S. ESIGN Act and
          applicable state law. You are responsible for reviewing every document before
          filing, sending, or requesting signatures, and for ensuring your use complies with
          your brokerage’s policies, MLS rules, and the laws of your state. Pheme is not a
          law firm, does not provide legal advice, and is not a party to your transactions.
        </p>
        <h3 className="cardTitle">AI assistance</h3>
        <p style={{ marginBottom: 14 }}>
          Pheme uses AI to interpret your instructions and fill forms. AI can make mistakes —
          always verify names, prices, dates, and terms before a document leaves your hands.
        </p>
        <h3 className="cardTitle">Acceptable use</h3>
        <p style={{ marginBottom: 14 }}>
          No unlawful use, no sending documents or messages to people without a lawful basis
          to contact them, no attempting to access other accounts’ data, and no abuse of the
          service’s messaging features.
        </p>
        <h3 className="cardTitle">Billing</h3>
        <p style={{ marginBottom: 14 }}>
          During early access Pheme is free. If you later subscribe to a paid plan, pricing
          and renewal terms are shown at checkout and manageable from Settings.
        </p>
        <h3 className="cardTitle">Disclaimers</h3>
        <p style={{ marginBottom: 14 }}>
          The service is provided “as is” without warranties of any kind. To the maximum
          extent permitted by law, our liability is limited to the amount you paid us in the
          twelve months before the claim.
        </p>
        <h3 className="cardTitle">Contact</h3>
        <p>Questions? Email documents@pheme.deals or text (475) 270-3374.</p>
      </div>
    </div>
  );
}

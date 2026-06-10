export const metadata = { title: "Privacy Policy — Pheme" };

export default function PrivacyPage() {
  return (
    <div className="stack" style={{ maxWidth: 760, margin: "0 auto" }}>
      <h1 className="pageTitle">Privacy Policy</h1>
      <p className="muted">Last updated: June 9, 2026</p>
      <div className="card" style={{ lineHeight: 1.7 }}>
        <h3 className="cardTitle">What we collect</h3>
        <p style={{ marginBottom: 14 }}>
          Account details (name, email, phone, brokerage info), the documents and client
          records you create, uploaded form templates, signature records (including signer
          name, contact, IP address, and consent timestamps — kept as the audit trail), and
          conversation transcripts with the assistant (web, SMS, and voice) used to carry out
          your requests.
        </p>
        <h3 className="cardTitle">How we use it</h3>
        <p style={{ marginBottom: 14 }}>
          To run the service: filling and delivering your documents, remembering your clients
          for you, routing calls and texts to your account, and securing the platform. We do
          not sell your data, and we don’t use your documents to advertise to anyone.
        </p>
        <h3 className="cardTitle">Service providers</h3>
        <p style={{ marginBottom: 14 }}>
          We rely on a small set of processors to operate: Supabase (database & file
          storage), Vercel (hosting), OpenAI (AI processing of your instructions and
          documents), Vapi (voice calls), Twilio (calls & SMS), Resend (email), and Stripe
          (payments, if you subscribe). Each receives only what it needs to do its job.
        </p>
        <h3 className="cardTitle">Retention & deletion</h3>
        <p style={{ marginBottom: 14 }}>
          Your data stays until you delete it. Removing a document, client, or form deletes
          that record; deleting your account in Settings removes your account and its data
          from production systems, with residual copies in backups expiring on a rolling
          basis.
        </p>
        <h3 className="cardTitle">Security</h3>
        <p style={{ marginBottom: 14 }}>
          Data is encrypted in transit and at rest, access is scoped per-account with
          row-level security, document links use signed unguessable tokens, and webhooks are
          signature-verified.
        </p>
        <h3 className="cardTitle">Contact</h3>
        <p>Privacy questions: documents@pheme.deals.</p>
      </div>
    </div>
  );
}

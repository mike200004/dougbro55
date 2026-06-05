import Link from "next/link";
import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <div className="stack" style={{ maxWidth: 520, margin: "0 auto" }}>
      <div>
        <h1 className="pageTitle">Create your account</h1>
        <p className="pageSub">
          Sign up to use the assistant by web, phone, or text. The phone number you
          register is how calls and texts are matched to your account.
        </p>
      </div>
      <SignupForm />
      <p className="muted">
        Already have an account?{" "}
        <Link href="/login" style={{ color: "var(--brand-soft)" }}>
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}

import Link from "next/link";
import SignupForm from "./SignupForm";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <div className="authWrap" style={{ maxWidth: 520 }}>
      <h1 className="pageTitle">Create your account</h1>
      <p className="pageSub">
        Sign up to use the assistant by web, phone, or text. The phone number you
        register is how calls and texts are matched to your account.
      </p>
      <SignupForm />
      <p className="muted" style={{ marginTop: 16 }}>
        Already have an account? <Link href="/login">Sign in</Link>.
      </p>
    </div>
  );
}

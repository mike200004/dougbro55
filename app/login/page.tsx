import Link from "next/link";
import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="stack" style={{ maxWidth: 420, margin: "0 auto" }}>
      <div>
        <h1 className="pageTitle">Sign in</h1>
        <p className="pageSub">Welcome back to your portal.</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="muted">
        No account?{" "}
        <Link href="/signup" style={{ color: "var(--brand-soft)" }}>
          Create one
        </Link>
        .
      </p>
    </div>
  );
}

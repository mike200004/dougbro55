import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="authWrap">
      <div className="authLogo">
        <Image src="/pheme-mark.png" alt="Pheme" width={1402} height={1122} priority />
      </div>
      <h1 className="pageTitle">Sign in</h1>
      <p className="pageSub">Welcome back to your portal.</p>
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="muted" style={{ marginTop: 16 }}>
        No account? <Link href="/signup">Create one</Link>.
      </p>
    </div>
  );
}

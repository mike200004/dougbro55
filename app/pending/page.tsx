import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccount } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  // Approved users shouldn't linger here.
  const account = await getAccount();
  if (account?.status === "active") redirect("/");

  return (
    <div className="authWrap" style={{ textAlign: "center" }}>
      <h1 className="pageTitle">You’re on the list ✓</h1>
      <p className="pageSub" style={{ margin: "12px auto 24px", maxWidth: 460 }}>
        Pheme is in private beta. Your account has been created and is{" "}
        <strong>pending approval</strong> — we review new accounts by hand and you’ll get an
        email the moment you’re in. Thanks for your patience.
      </p>
      <p className="muted" style={{ fontSize: 14 }}>
        Already approved? <Link href="/login">Sign in</Link>.
      </p>
    </div>
  );
}

import { Suspense } from "react";
import AcceptInvite from "./AcceptInvite";

export const dynamic = "force-dynamic";

export default function AcceptInvitePage() {
  return (
    <div className="stack" style={{ maxWidth: 420, margin: "0 auto" }}>
      <div>
        <h1 className="pageTitle">Set your password</h1>
        <p className="pageSub">
          You’ve been invited as an assistant. Choose a password to finish setting up
          your login.
        </p>
      </div>
      <Suspense>
        <AcceptInvite />
      </Suspense>
    </div>
  );
}

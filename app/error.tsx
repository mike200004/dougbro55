"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Actually record the error — the copy below tells the user it's "been noted".
  useEffect(() => {
    console.error("App error boundary:", error.digest ?? "", error);
  }, [error]);

  return (
    <div className="authWrap" style={{ textAlign: "center", paddingTop: 40 }}>
      <h1 className="pageTitle">Something went wrong</h1>
      <p className="pageSub" style={{ margin: "12px auto 24px" }}>
        Sorry about that — it’s been noted. Try again, and if it keeps happening, text us at
        (475) 270-3374.
      </p>
      <button className="btn btnPrimary" onClick={reset}>Try again</button>
    </div>
  );
}

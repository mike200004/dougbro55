"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
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

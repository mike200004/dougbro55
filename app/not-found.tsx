import Link from "next/link";

export default function NotFound() {
  return (
    <div className="authWrap" style={{ textAlign: "center", paddingTop: 40 }}>
      <h1 className="pageTitle">Page not found</h1>
      <p className="pageSub" style={{ margin: "12px auto 24px" }}>
        That page doesn’t exist — but your paperwork is probably waiting.
      </p>
      <Link href="/" className="btn btnPrimary">Back to Pheme</Link>
    </div>
  );
}

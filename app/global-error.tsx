"use client";

/**
 * Last-resort boundary: catches errors thrown in the root layout itself,
 * which app/error.tsx cannot. Without it those render as an unstyled browser
 * error page with no way back.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "48px 24px", textAlign: "center" }}>
        <h1 style={{ fontSize: 22, marginBottom: 10 }}>Something went wrong</h1>
        <p style={{ color: "#6b7280", marginBottom: 20 }}>
          Sorry — Pheme hit an unexpected error. Your documents are safe.
          {error?.digest ? ` (ref ${error.digest})` : ""}
        </p>
        <button
          onClick={reset}
          style={{ padding: "10px 18px", borderRadius: 6, border: "1px solid #1f2937", background: "#1f2937", color: "#fff", cursor: "pointer" }}
        >
          Try again
        </button>
        <p style={{ marginTop: 16 }}>
          <a href="/" style={{ color: "#1f2937" }}>Back to the dashboard</a>
        </p>
      </body>
    </html>
  );
}

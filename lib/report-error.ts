/**
 * Report a browser-side failure to the server log.
 *
 * Use this in every catch block that hides a real failure behind a friendly
 * message. The user still gets the friendly message — but we stop being blind
 * to a feature that is broken for everyone (the pdf.js worker outage looked
 * exactly like "the user's PDF is bad" and nothing recorded the truth).
 *
 * Fire-and-forget by design: never awaited, never throws, never blocks the UI.
 */
export function reportClientError(context: string, err: unknown, extra?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const e = err as { message?: string; stack?: string; name?: string } | undefined;
    const message =
      (e && (e.message || e.name)) || (typeof err === "string" ? err : JSON.stringify(err)) || "unknown error";
    const payload = JSON.stringify({
      context: extra ? `${context} ${JSON.stringify(extra)}` : context,
      message,
      stack: e?.stack,
      url: window.location?.pathname,
    });
    // keepalive so the report still goes out if the page navigates away.
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never let error reporting create an error.
  }
}

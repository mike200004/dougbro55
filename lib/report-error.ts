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
/**
 * Errors that are noise, not defects: browser/extension chatter that would
 * bury real failures in the runtime-error view and destroy its value as a
 * health signal. Keep this list tight — when in doubt, report it.
 */
const IGNORED = [
  /ResizeObserver loop/i, // benign browser layout notice, fires constantly
  /^Script error\.?$/i, // cross-origin script with no detail (usually an extension)
  /chrome-extension:|moz-extension:|safari-extension:/i,
  /Non-Error promise rejection captured with value: undefined/i,
  /The play\(\) request was interrupted/i,
];

export function reportClientError(context: string, err: unknown, extra?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const e = err as { message?: string; stack?: string; name?: string } | undefined;
    const message =
      (e && (e.message || e.name)) || (typeof err === "string" ? err : JSON.stringify(err)) || "unknown error";
    if (IGNORED.some((re) => re.test(message) || (e?.stack ? re.test(e.stack) : false))) return;
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

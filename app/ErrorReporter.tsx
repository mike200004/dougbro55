"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";

/**
 * Catches the browser errors nobody wrote a handler for — uncaught exceptions
 * and unhandled promise rejections — and reports them to the server log so a
 * silently-broken page shows up in Vercel's runtime errors instead of waiting
 * for a customer to tell us.
 *
 * Renders nothing.
 */
export default function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      reportClientError("window.onerror", e.error ?? e.message, {
        at: `${e.filename ?? "?"}:${e.lineno ?? 0}`,
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      reportClientError("unhandledrejection", e.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}

import { after } from "next/server";

/**
 * Run background work after the HTTP response is sent (Vercel keeps the
 * function alive via waitUntil). On a live phone call every awaited write is
 * dead air, so bookkeeping (activity log, auto-learn, recap SMS) goes through
 * here. Outside a request scope (scripts, tests) `after` throws — fall back to
 * a best-effort floating promise.
 */
export function defer(task: () => Promise<unknown>): void {
  try {
    after(async () => {
      try {
        await task();
      } catch {
        // deferred work is best-effort by definition
      }
    });
  } catch {
    void task().catch(() => {});
  }
}

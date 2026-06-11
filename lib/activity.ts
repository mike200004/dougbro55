import { admin } from "@/lib/supabase/admin";
import { defer } from "@/lib/defer";
import type { ActivityRecord } from "@/lib/types";

/**
 * Account activity feed. Logging is fire-and-forget — it runs after the
 * response is sent (defer) so it adds zero latency to the operation it
 * describes (on a phone call, every awaited write is dead air), and a failed
 * log line never breaks anything.
 */
export async function logActivity(
  accountId: string,
  type: string,
  message: string,
  opts?: { actorId?: string | null; meta?: Record<string, unknown> },
): Promise<void> {
  defer(async () => {
    await admin().from("activity").insert({
      account_id: accountId,
      actor_id: opts?.actorId ?? null,
      type,
      message,
      meta: opts?.meta ?? {},
    });
  });
}

export async function listActivity(accountId: string, limit = 30): Promise<ActivityRecord[]> {
  const { data } = await admin()
    .from("activity")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as ActivityRecord[]) ?? [];
}

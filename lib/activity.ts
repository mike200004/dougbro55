import { admin } from "@/lib/supabase/admin";
import type { ActivityRecord } from "@/lib/types";

/**
 * Account activity feed. Logging is fire-and-forget — a failed log line must
 * never break the user-facing operation it describes.
 */
export async function logActivity(
  accountId: string,
  type: string,
  message: string,
  opts?: { actorId?: string | null; meta?: Record<string, unknown> },
): Promise<void> {
  try {
    await admin().from("activity").insert({
      account_id: accountId,
      actor_id: opts?.actorId ?? null,
      type,
      message,
      meta: opts?.meta ?? {},
    });
  } catch {
    // ignore — activity is best-effort
  }
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

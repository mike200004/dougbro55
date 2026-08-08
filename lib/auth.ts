import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getMember } from "@/lib/db";

export interface SessionUser {
  userId: string;
  email: string | null;
}

export interface Account {
  userId: string; // the acting member's auth id (the actor)
  email: string | null;
  accountId: string; // the owner's id — the effective account for data
  role: "owner" | "assistant";
  name: string; // actor's display name
  status: "active" | "invited" | "pending"; // beta gate: only 'active' may use the app
}

/** Returns the signed-in user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServer();
  // ui-error-ok: a missing/expired session is the normal signed-out path —
  // getUser() reports that as an error, and treating it as a failure would
  // break every logged-out page.
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { userId: data.user.id, email: data.user.email ?? null };
}

/** Resolve the acting user + their effective account, or null if not a member. */
export async function getAccount(): Promise<Account | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const member = await getMember(user.userId);
  if (!member) return null;
  return {
    userId: user.userId,
    email: user.email,
    accountId: member.accountId,
    role: member.role,
    name: member.name,
    status: member.status,
  };
}

/**
 * Resolve the account or redirect: to /login if not signed in, to /pending if
 * the account is awaiting beta approval (or an unaccepted invite). Used by
 * every protected page + server action, so the beta gate is enforced in one
 * place.
 */
export async function requireAccount(): Promise<Account> {
  const account = await getAccount();
  if (!account) redirect("/login");
  if (account.status !== "active") redirect("/pending");
  return account;
}

import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

export interface SessionUser {
  userId: string;
  email: string | null;
}

/** Returns the signed-in user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { userId: data.user.id, email: data.user.email ?? null };
}

/** Returns the signed-in user or redirects to /login. */
export async function requireAccount(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for all DATA access (bypasses RLS). The app always
 * filters explicitly by account_id; RLS is a backstop. Never expose this to
 * the browser — server-only.
 */
let _admin: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (!_admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    }
    _admin = createClient(url, key, { auth: { persistSession: false } });
  }
  return _admin;
}

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

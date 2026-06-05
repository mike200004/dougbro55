import { createBrowserClient } from "@supabase/ssr";

/** Browser client (anon key) — for auth actions from client components. */
export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

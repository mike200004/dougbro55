"use client";

import { createSupabaseBrowser } from "@/lib/supabase/client";

export default function LogoutButton() {
  return (
    <button
      className="navlink"
      style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
      onClick={async () => {
        await createSupabaseBrowser().auth.signOut();
        window.location.assign("/login");
      }}
    >
      Log out
    </button>
  );
}

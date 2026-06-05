"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await createSupabaseBrowser().auth.signOut();
        router.refresh();
        router.push("/login");
      }}
      style={{
        background: "none",
        border: "none",
        color: "var(--text-muted)",
        cursor: "pointer",
        font: "inherit",
        fontSize: 15,
      }}
    >
      Log out
    </button>
  );
}

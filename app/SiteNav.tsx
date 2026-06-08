"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/assistant", label: "Assistant" },
  { href: "/settings", label: "Settings" },
];

export default function SiteNav({ email }: { email: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const signedIn = !!email;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  async function logout() {
    await createSupabaseBrowser().auth.signOut();
    window.location.assign("/login");
  }

  const links = signedIn ? LINKS : [];

  return (
    <nav className="nav">
      <div className="navInner">
        <Link href="/" className="brand" onClick={() => setOpen(false)}>
          Phe<span className="brandAccent">me</span>
        </Link>

        {/* Desktop */}
        <div className="navlinks navDesktop">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`navlink${isActive(l.href) ? " active" : ""}`}>
              {l.label}
            </Link>
          ))}
          {signedIn ? (
            <>
              <span className="navEmail">{email}</span>
              <button className="navlink" type="button" onClick={logout}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="navlink">Sign in</Link>
              <Link href="/signup" className="btn btnPrimary">Sign up</Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="navToggle"
          type="button"
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span /><span /><span />
        </button>
      </div>

      {open && (
        <div className="navMobile">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`navMobileLink${isActive(l.href) ? " active" : ""}`}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          {signedIn ? (
            <>
              <div className="navMobileEmail">{email}</div>
              <button className="navMobileLink" type="button" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="navMobileLink" onClick={() => setOpen(false)}>
                Sign in
              </Link>
              <Link href="/signup" className="navMobileLink" onClick={() => setOpen(false)}>
                Sign up
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Lato, Merriweather } from "next/font/google";
import "./globals.css";
import { getSessionUser } from "@/lib/auth";
import LogoutButton from "./LogoutButton";
import NavLinks from "./NavLinks";

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-sans-loaded",
  display: "swap",
});
const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-serif-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dougbro55 — Real Estate Agent Portal",
  description:
    "Fill, file, and send Connecticut real estate documents by voice, text, or web — with an assistant that remembers your clients.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  const year = 2026;

  return (
    <html lang="en">
      <body className={`${lato.variable} ${merriweather.variable}`}>
        <nav className="nav">
          <div className="navInner">
            <Link href="/" className="brand">
              Dougbro<span className="brandAccent">55</span>
            </Link>
            <div className="navlinks">
              {user ? (
                <>
                  <NavLinks
                    items={[
                      { href: "/", label: "Dashboard" },
                      { href: "/assistant", label: "Assistant" },
                      { href: "/settings", label: "Settings" },
                    ]}
                  />
                  <span className="navEmail">{user.email}</span>
                  <LogoutButton />
                </>
              ) : (
                <>
                  <Link href="/login" className="navlink">
                    Sign in
                  </Link>
                  <Link href="/signup" className="btn btnPrimary">
                    Sign up
                  </Link>
                </>
              )}
            </div>
          </div>
        </nav>

        <div className="container">{children}</div>

        <footer className="footer">
          <div className="footerInner">
            <span>
              <strong style={{ color: "var(--ink)", fontFamily: "var(--font-serif)" }}>
                Dougbro55
              </strong>{" "}
              · Connecticut real estate documents, handled.
            </span>
            <span>
              Call or text <a href="tel:+14752703374">(475) 270-3374</a> · © {year}
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}

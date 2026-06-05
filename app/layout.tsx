import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getSessionUser } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

export const metadata: Metadata = {
  title: "Dougbro55 — Real Estate Agent Portal",
  description:
    "A personal home base for a real estate agent: clients, documents, and an AI assistant.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();

  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <div className="navInner">
            <Link href="/" className="brand">
              Dougbro<span className="brandAccent">55</span>
            </Link>
            <div className="navlinks">
              {user ? (
                <>
                  <Link href="/">Dashboard</Link>
                  <Link href="/assistant">Assistant</Link>
                  <Link href="/settings">Settings</Link>
                  <span className="muted" style={{ fontSize: 13 }}>{user.email}</span>
                  <LogoutButton />
                </>
              ) : (
                <>
                  <Link href="/login">Sign in</Link>
                  <Link href="/signup">Sign up</Link>
                </>
              )}
            </div>
          </div>
        </nav>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}

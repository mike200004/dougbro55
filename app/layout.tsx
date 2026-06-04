import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dougbro55 — Real Estate Agent Portal",
  description:
    "A personal home base for a real estate agent: clients, documents, and an AI assistant.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <div className="navInner">
            <Link href="/" className="brand">
              Dougbro<span className="brandAccent">55</span>
            </Link>
            <div className="navlinks">
              <Link href="/">Dashboard</Link>
              <Link href="/assistant">Assistant</Link>
              <Link href="/settings">Settings</Link>
            </div>
          </div>
        </nav>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}

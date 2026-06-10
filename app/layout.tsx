import type { Metadata } from "next";
import { Lato, Merriweather } from "next/font/google";
import "./globals.css";
import { getSessionUser } from "@/lib/auth";
import SiteNav from "./SiteNav";

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-sans",
  display: "swap",
});
const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://pheme.deals"),
  title: "Pheme — Voice that carries.",
  description:
    "Fill, file, e-sign, and send real estate documents by voice, text, or web — with an assistant that remembers your clients.",
  openGraph: {
    title: "Pheme — Voice that carries.",
    description:
      "The assistant for real estate agents and brokerages. Fill, file, e-sign, and send your documents by phone, text, or web.",
    images: ["/pheme-logo.png"],
    type: "website",
    url: "/",
  },
  twitter: { card: "summary_large_image", images: ["/pheme-logo.png"] },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  const year = 2026;

  return (
    <html lang="en">
      <body className={`${lato.variable} ${merriweather.variable}`}>
        <SiteNav email={user?.email ?? null} />

        <div className="container">{children}</div>

        <footer className="footer">
          <div className="footerInner">
            <span>
              <strong style={{ color: "var(--ink)", fontFamily: "var(--font-serif)" }}>
                Pheme
              </strong>{" "}
              · Voice that carries.
            </span>
            <span>
              Call or text <a href="tel:+14752703374">(475) 270-3374</a> ·{" "}
              <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · © {year}
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}

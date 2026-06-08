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
  title: "Pheme — Real Estate Agent Portal",
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
              Call or text <a href="tel:+14752703374">(475) 270-3374</a> · © {year}
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}

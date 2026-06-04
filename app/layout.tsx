import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dougbro55 — AI Assistant for Real Estate",
  description:
    "The host portal and AI assistant that helps real estate agents work smarter.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

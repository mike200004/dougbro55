import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://pheme.deals";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/sign/", "/documents", "/clients", "/settings", "/assistant", "/forms"] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}

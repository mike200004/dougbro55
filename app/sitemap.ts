import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://pheme.deals";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/signup", "/login", "/terms", "/privacy"].map((path) => ({
    url: `${SITE}${path}`,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.5,
  }));
}

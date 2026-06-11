import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF route reads the source forms from templates/ via fs at runtime.
  // Next's build tracer can't see those reads, so include them explicitly so
  // they're bundled into the serverless function on Vercel.
  outputFileTracingIncludes: {
    "/api/documents/[id]/pdf": ["./templates/**/*"],
  },
  // Uploaded form PDFs travel through server actions (base64-inflated ~33%);
  // the 1MB default rejected any normal scanned form.
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;

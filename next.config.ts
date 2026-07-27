import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the file-tracing root to THIS project. A stray pnpm-lock.yaml in a
  // parent directory made Next infer the workspace root incorrectly, which can
  // mis-trace the serverless bundle on Vercel (and logged a warning every run).
  outputFileTracingRoot: __dirname,
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

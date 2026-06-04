import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF route reads the source forms from templates/ via fs at runtime.
  // Next's build tracer can't see those reads, so include them explicitly so
  // they're bundled into the serverless function on Vercel.
  outputFileTracingIncludes: {
    "/api/documents/[id]/pdf": ["./templates/**/*"],
  },
};

export default nextConfig;

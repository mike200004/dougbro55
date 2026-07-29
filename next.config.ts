import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the file-tracing root to THIS project. A stray pnpm-lock.yaml in a
  // parent directory made Next infer the workspace root incorrectly, which can
  // mis-trace the serverless bundle on Vercel (and logged a warning every run).
  outputFileTracingRoot: __dirname,
  // Built-in form PDFs are read from templates/ via fs at runtime
  // (lib/pdf/fill.ts). Next's build tracer can't see those reads, so every
  // serverless function that can render a document must list them explicitly
  // or it 500s with ENOENT in production: the owner PDF route, the public
  // share/sign routes, and the three assistant channels (their tools can
  // email/attach rendered PDFs).
  outputFileTracingIncludes: {
    "/api/documents/[id]/pdf": ["./templates/**/*"],
    "/api/sign/[token]": ["./templates/**/*"],
    "/api/share/[token]": ["./templates/**/*"],
    "/api/chat": ["./templates/**/*"],
    "/api/sms": ["./templates/**/*"],
    "/api/voice/tools": ["./templates/**/*"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // The sign page iframes our own PDF endpoint; same-origin framing stays allowed.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
  // Uploaded form PDFs travel through server actions (base64-inflated ~33%);
  // the 1MB default rejected any normal scanned form.
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;

import type { NextConfig } from "next";

// Per-request nonce CSP is set in middleware.
const nextConfig: NextConfig = {
  output: "standalone",
  // This app uses SVG/CSS assets; no public image-processing service is needed.
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["firebase-admin", "web-push"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "microphone=(self), geolocation=(), camera=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

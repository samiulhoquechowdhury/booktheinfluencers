import type { NextConfig } from "next";

// Served under /admin. In development the website proxies /admin here (see apps/web/next.config.ts),
// so both apps share one browser origin — and therefore the in-browser mock data.
const nextConfig: NextConfig = {
  basePath: "/admin",
  transpilePackages: ["@repo/mock", "@repo/schemas", "@repo/ui", "@repo/utils"],
  // Opened directly on :3001, admin forwards /v1 to the API itself (outside its /admin basePath).
  async rewrites() {
    const api = process.env.API_URL?.replace(/\/$/, "");
    return api ? [{ source: "/v1/:path*", destination: `${api}/v1/:path*`, basePath: false as const }] : [];
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

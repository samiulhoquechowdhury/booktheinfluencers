import type { NextConfig } from "next";

// Served under /admin. In development the website proxies /admin here (see apps/web/next.config.ts),
// so both apps share one browser origin — and therefore the in-browser mock data.
const nextConfig: NextConfig = {
  basePath: "/admin",
  transpilePackages: ["@repo/mock", "@repo/schemas", "@repo/ui", "@repo/utils"],
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

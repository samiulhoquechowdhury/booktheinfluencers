import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@repo/mock", "@repo/schemas", "@repo/ui", "@repo/utils"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  // The staff CRM is its own app (apps/admin, basePath /admin). Proxying it keeps one browser
  // origin in development so both apps share the in-browser mock data. Set ADMIN_ORIGIN to
  // the admin deployment, or leave the admin on its own domain once the real API is live.
  async rewrites() {
    const admin = process.env.ADMIN_ORIGIN || "http://localhost:3001";
    return [
      { source: "/admin", destination: `${admin}/admin` },
      { source: "/admin/:path*", destination: `${admin}/admin/:path*` },
    ];
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

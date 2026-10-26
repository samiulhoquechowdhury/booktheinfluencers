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
    // With API_URL set, the browser calls /v1/* on this origin and it's forwarded to apps/api,
    // so the httpOnly refresh cookie stays first-party (no cross-site cookies or CORS for the app).
    const api = process.env.API_URL?.replace(/\/$/, "");
    return [
      { source: "/admin", destination: `${admin}/admin` },
      { source: "/admin/:path*", destination: `${admin}/admin/:path*` },
      ...(api ? [{ source: "/v1/:path*", destination: `${api}/v1/:path*` }] : []),
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

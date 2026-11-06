import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The dev badge would sit on top of pages filmed for the demo (and Plex for Mac's Insights web view).
  devIndicators: false,
  // The demo world's merchant sites answer on claycommons.localhost:3000 and friends (src/proxy.ts).
  allowedDevOrigins: ["*.localhost"],
  partialPrefetching: true,
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

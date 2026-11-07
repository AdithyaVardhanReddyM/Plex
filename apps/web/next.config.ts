import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The dev badge would sit on top of pages filmed for the demo.
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

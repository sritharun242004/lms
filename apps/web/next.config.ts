import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly — an unrelated lockfile on the
  // user's Desktop (above this monorepo) otherwise makes Next.js guess
  // the wrong root and warn on every build.
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;

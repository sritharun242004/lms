import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output lets us copy a self-contained runtime into the
  // container without shipping all of node_modules.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;

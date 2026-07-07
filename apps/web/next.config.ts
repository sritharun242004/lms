import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
};

export default nextConfig;

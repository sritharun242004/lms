import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly — an unrelated lockfile on the
  // user's Desktop (above this monorepo) otherwise makes Next.js guess
  // the wrong root and warn on every build.
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  experimental: {
    // Requests pass through proxy.ts, which buffers the body up to this
    // limit before route handlers see it — must exceed MAX_ATTACHMENT_SIZE_BYTES
    // (25MB, from @lms/shared) or chat file uploads get silently truncated.
    proxyClientMaxBodySize: "30mb",
  },
};

export default nextConfig;

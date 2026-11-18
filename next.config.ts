import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // All backend communication is proxied through the BFF route handler at /api/backend/[...path]
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const rawBackendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
    const backendUrl = rawBackendUrl.replace(/\/$/, "");
    return [
      {
        // Proxy all other /api routes to Fastify backend
        source: "/api/:path((?!auth).*)",
        destination: `${backendUrl}/api/:path*`,
      },
      // Specifically forward Fastify auth endpoints while leaving [...nextauth] intact
      {
        source: "/api/auth/status",
        destination: `${backendUrl}/api/auth/status`,
      },
      {
        source: "/api/auth/login",
        destination: `${backendUrl}/api/auth/login`,
      },
      {
        source: "/api/auth/logout",
        destination: `${backendUrl}/api/auth/logout`,
      },
      {
        source: "/api/auth/me",
        destination: `${backendUrl}/api/auth/me`,
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const devAllowedOrigins = process.env.DEV_ALLOWED_ORIGINS
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["depot.rj-info.com", "*.trycloudflare.com", ...devAllowedOrigins],
  async redirects() {
    return [
      { source: "/settings/users", destination: "/organization", permanent: true },
      { source: "/settings/teams", destination: "/organization", permanent: true },
    ];
  },
};

export default nextConfig;

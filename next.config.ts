import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["graphile-worker"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
};

export default nextConfig;

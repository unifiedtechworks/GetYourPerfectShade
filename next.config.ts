import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/products",
        destination: "/gallery",
        permanent: true
      }
    ];
  }
};

export default nextConfig;

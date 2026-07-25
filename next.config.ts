import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    formats: ["image/avif", "image/webp"],
    unoptimized: true
  },
  poweredByHeader: false
};

export default nextConfig;

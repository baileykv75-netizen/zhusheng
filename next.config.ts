import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    formats: ["image/avif", "image/webp"],
    unoptimized: true
  },
  poweredByHeader: false
};

export default nextConfig;

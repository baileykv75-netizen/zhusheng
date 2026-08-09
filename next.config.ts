import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  output: "export",
  trailingSlash: true,
  images: {
    formats: ["image/avif", "image/webp"],
    unoptimized: true
  },
  poweredByHeader: false
};

export default nextConfig;

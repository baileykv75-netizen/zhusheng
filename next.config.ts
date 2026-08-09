import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  output: "export",
  trailingSlash: true,
  basePath,
  images: {
    formats: ["image/avif", "image/webp"],
    unoptimized: true
  },
  poweredByHeader: false
};

export default nextConfig;

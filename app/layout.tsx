import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { DemoProvider } from "@/components/demo-provider";
import { Shell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "筑生：一栋房子一生的AI智能体",
  description: "从开工第一天，到入住每一天。建筑全生命周期智能体交互样机。"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0c0d0e"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preload" as="image" href="/assets/v4/building-stage.webp" type="image/webp" />
        <link rel="preload" as="image" href="/assets/v4/bathroom-stage.webp" type="image/webp" />
        <link rel="preload" as="image" href="/assets/v4/portfolio-stage.webp" type="image/webp" />
      </head>
      <body>
        <Suspense fallback={null}>
          <DemoProvider>
            <Shell>{children}</Shell>
          </DemoProvider>
        </Suspense>
      </body>
    </html>
  );
}

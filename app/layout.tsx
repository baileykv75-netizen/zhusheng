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
  themeColor: "#f5f5f2"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
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

import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { DemoProvider } from "@/components/demo-provider";
import { LifecycleJourneyProvider } from "@/components/lifecycle-journey-provider";
import { Shell } from "@/components/shell";
import "./globals.css";
import "./v6.css";
import "./display-headlines.css";

export const metadata: Metadata = {
  title: "筑生：一栋房子一生的AI智能体",
  description: "从开工第一天，到入住每一天。建筑全生命周期智能体交互样机。"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0d0d"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <Suspense fallback={null}>
          <DemoProvider>
            <LifecycleJourneyProvider>
              <Shell>{children}</Shell>
            </LifecycleJourneyProvider>
          </DemoProvider>
        </Suspense>
      </body>
    </html>
  );
}

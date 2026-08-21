import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { DemoProvider } from "@/components/demo-provider";
import { LifecycleJourneyProvider } from "@/components/lifecycle-journey-provider";
import { BuildingContextProvider } from "@/components/product/BuildingContextProvider";
import { ComponentLifeOverlay } from "@/components/product/ComponentLifeOverlay";
import { ObjectHandoffBar } from "@/components/product/ObjectHandoffBar";
import { Shell } from "@/components/shell";
import "./globals.css";
import "./v6.css";
import "./display-headlines.css";
import "./product-tokens.css";
import "./product-polish.css";
import "./product-route-polish.css";
import "./product-finishing.css";

export const metadata: Metadata = {
  title: "筑生：一栋房子一生的AI智能体",
  description: "从开工第一天，到入住每一天。让建筑拥有连续记忆、可追溯事件与可验证的AI判断。"
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
              <BuildingContextProvider>
                <Shell>{children}</Shell>
                <ComponentLifeOverlay />
                <ObjectHandoffBar />
              </BuildingContextProvider>
            </LifecycleJourneyProvider>
          </DemoProvider>
        </Suspense>
      </body>
    </html>
  );
}

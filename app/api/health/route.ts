import { NextResponse } from "next/server";

export async function GET() {
  const configured = Boolean(process.env.AI_BASE_URL && process.env.AI_MODEL && process.env.AI_API_KEY);
  return NextResponse.json({
    ok: true,
    service: "筑生建筑全生命周期智能体",
    version: "2.0.0",
    mode: configured ? "ai" : "fallback",
    storage: "browser-session"
  });
}

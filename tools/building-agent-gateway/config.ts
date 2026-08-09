import type { GatewayConfig } from "./types.ts";

function positiveInteger(value: string | undefined, fallback: number, label: string) {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

export function loadGatewayConfig(env: Record<string, string | undefined> = process.env): GatewayConfig {
  const host = env.BUILDING_AGENT_GATEWAY_HOST || "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    throw new Error("Gateway host must be a loopback address");
  }
  return {
    apiKey: env.DEEPSEEK_API_KEY?.trim() ?? "",
    model: env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
    host,
    port: positiveInteger(env.BUILDING_AGENT_GATEWAY_PORT, 4180, "BUILDING_AGENT_GATEWAY_PORT"),
    allowedOrigins: (env.BUILDING_AGENT_ALLOWED_ORIGINS || "http://127.0.0.1:4174,http://localhost:4174").split(",").map((item) => item.trim()).filter(Boolean),
    timeoutMs: positiveInteger(env.BUILDING_AGENT_REQUEST_TIMEOUT_MS, 12000, "BUILDING_AGENT_REQUEST_TIMEOUT_MS"),
    maxInputChars: positiveInteger(env.BUILDING_AGENT_MAX_INPUT_CHARS, 4000, "BUILDING_AGENT_MAX_INPUT_CHARS"),
    maxOutputTokens: positiveInteger(env.BUILDING_AGENT_MAX_OUTPUT_TOKENS, 1200, "BUILDING_AGENT_MAX_OUTPUT_TOKENS")
  };
}

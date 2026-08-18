import type { GatewayConfig } from "./types.ts";

function positiveInteger(value: string | undefined, fallback: number, label: string) {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function enabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function parseOrigins(value: string | undefined, fallback: string[]) {
  const origins = (value ? value.split(",") : fallback).map((item) => item.trim().replace(/\/$/, "")).filter(Boolean);
  if (origins.some((origin) => origin === "*")) throw new Error("BUILDING_AGENT_ALLOWED_ORIGINS must not contain wildcard origins");
  return [...new Set(origins)];
}

export function loadGatewayConfig(env: Record<string, string | undefined> = process.env): GatewayConfig {
  const publicMode = enabled(env.BUILDING_AGENT_PUBLIC_MODE);
  const host = env.BUILDING_AGENT_GATEWAY_HOST || (publicMode ? "0.0.0.0" : "127.0.0.1");
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  if (publicMode) {
    if (host !== "0.0.0.0") throw new Error("Public gateway mode must bind BUILDING_AGENT_GATEWAY_HOST to 0.0.0.0");
  } else if (!loopbackHosts.has(host)) {
    throw new Error("Gateway host must be a loopback address unless BUILDING_AGENT_PUBLIC_MODE is enabled");
  }

  const allowedOrigins = parseOrigins(
    env.BUILDING_AGENT_ALLOWED_ORIGINS,
    publicMode ? [] : ["http://127.0.0.1:4174", "http://localhost:4174"]
  );
  if (publicMode && !allowedOrigins.length) throw new Error("Public gateway mode requires an explicit BUILDING_AGENT_ALLOWED_ORIGINS allowlist");
  if (publicMode && allowedOrigins.some((origin) => !origin.startsWith("https://"))) {
    throw new Error("Public gateway origins must use https://");
  }

  return {
    apiKey: env.DEEPSEEK_API_KEY?.trim() ?? "",
    model: env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
    host: host as GatewayConfig["host"],
    port: positiveInteger(env.BUILDING_AGENT_GATEWAY_PORT ?? env.PORT, publicMode ? 10_000 : 4_180, "BUILDING_AGENT_GATEWAY_PORT/PORT"),
    allowedOrigins,
    publicMode,
    timeoutMs: positiveInteger(env.BUILDING_AGENT_REQUEST_TIMEOUT_MS, 12_000, "BUILDING_AGENT_REQUEST_TIMEOUT_MS"),
    maxInputChars: positiveInteger(env.BUILDING_AGENT_MAX_INPUT_CHARS, 4_000, "BUILDING_AGENT_MAX_INPUT_CHARS"),
    maxOutputTokens: positiveInteger(env.BUILDING_AGENT_MAX_OUTPUT_TOKENS, 1_200, "BUILDING_AGENT_MAX_OUTPUT_TOKENS")
  };
}

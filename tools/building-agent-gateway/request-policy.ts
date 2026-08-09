import type { IncomingMessage, ServerResponse } from "node:http";
import type { GatewayConfig } from "./types.ts";

export class GatewayRequestError extends Error {
  readonly status: number;
  readonly type: string;
  constructor(status: number, type: string, message: string) {
    super(message);
    this.status = status;
    this.type = type;
  }
}

export function applySecurityHeaders(response: ServerResponse, origin?: string) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }
}

export function verifyOrigin(request: IncomingMessage, config: GatewayConfig) {
  const origin = request.headers.origin;
  if (origin && !config.allowedOrigins.includes(origin)) throw new GatewayRequestError(403, "ORIGIN_REJECTED", "请求Origin不在允许列表");
  return origin;
}

export async function readJsonBody(request: IncomingMessage, maximumBytes = 64 * 1024) {
  if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    throw new GatewayRequestError(415, "CONTENT_TYPE_REJECTED", "仅接受application/json");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBytes) throw new GatewayRequestError(413, "BODY_TOO_LARGE", "请求体超过限制");
    chunks.push(buffer);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not object");
    return value as Record<string, unknown>;
  } catch {
    throw new GatewayRequestError(400, "INVALID_JSON", "请求体不是有效JSON对象");
  }
}

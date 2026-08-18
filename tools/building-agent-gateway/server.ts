import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadGatewayConfig } from "./config.ts";
import { DeepSeekChatProvider, GatewayProviderError } from "./deepseek-provider.ts";
import { MemoryRateLimiter } from "./rate-limit.ts";
import { applySecurityHeaders, GatewayRequestError, readJsonBody, verifyOrigin } from "./request-policy.ts";
import { redactError } from "./redaction.ts";
import type { GatewayConfig, ModelTask } from "./types.ts";

type ServerOptions = { config?: GatewayConfig; provider?: DeepSeekChatProvider; rateLimiter?: MemoryRateLimiter };

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function statusForProviderError(type: string) {
  if (type === "UNCONFIGURED") return 503;
  if (type === "AUTH_ERROR") return 502;
  if (type === "RATE_LIMITED") return 429;
  if (type === "TIMEOUT") return 504;
  if (type === "SENSITIVE_INPUT") return 400;
  if (type === "MODEL_UNAVAILABLE") return 422;
  return 502;
}

export function createGatewayServer(options: ServerOptions = {}): { server: Server; config: GatewayConfig } {
  const config = options.config ?? loadGatewayConfig();
  const provider = options.provider ?? new DeepSeekChatProvider(config);
  const limiter = options.rateLimiter ?? new MemoryRateLimiter();
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const requestId = randomUUID();
    let responseOrigin: string | undefined;
    response.setHeader("X-Request-Id", requestId);
    try {
      const isHealth = request.method === "GET" && request.url === "/health";
      responseOrigin = verifyOrigin(request, config, config.publicMode && !isHealth);
      applySecurityHeaders(response, responseOrigin);
      if (request.method === "OPTIONS") {
        response.statusCode = 204;
        response.end();
        return;
      }
      if (isHealth) {
        sendJson(response, 200, {
          status: "ok",
          provider: "deepseek",
          providerConfigured: Boolean(config.apiKey),
          model: config.model,
          deploymentMode: config.publicMode ? "public" : "local"
        });
        return;
      }
      if (request.method !== "POST") throw new GatewayRequestError(405, "METHOD_NOT_ALLOWED", "不支持的请求方法");
      const remote = request.socket.remoteAddress ?? "unknown";
      if (!limiter.accept(remote)) throw new GatewayRequestError(429, "GATEWAY_RATE_LIMITED", "AI 网关请求过于频繁，请稍后再试");
      const body = await readJsonBody(request);
      if (request.url === "/v1/agent/query") {
        if (typeof body.question !== "string" || !body.question.trim()) throw new GatewayRequestError(400, "QUESTION_INVALID", "question必须是非空字符串");
        if (body.selectedBusinessId !== undefined && body.selectedBusinessId !== null && typeof body.selectedBusinessId !== "string") throw new GatewayRequestError(400, "CONTEXT_INVALID", "selectedBusinessId必须是字符串或null");
        const output = await provider.queryBuilding(body.question, typeof body.selectedBusinessId === "string" ? body.selectedBusinessId : null, requestId);
        sendJson(response, 200, { ok: true, ...output });
        return;
      }
      let task: ModelTask;
      let payload: { input: string } | { verifiedResult: Record<string, unknown> };
      if (request.url === "/v1/agent/interpret") {
        task = body.task === "PROPOSE_READ_ONLY_TOOLS" ? "PROPOSE_READ_ONLY_TOOLS" : "INTERPRET_OBSERVATION";
        if (body.task !== undefined && body.task !== task) throw new GatewayRequestError(400, "TASK_REJECTED", "解释端点不支持该任务");
        if (typeof body.input !== "string") throw new GatewayRequestError(400, "INPUT_INVALID", "input必须是字符串");
        payload = { input: body.input };
      } else if (request.url === "/v1/agent/explain") {
        task = "EXPLAIN_VERIFIED_RESULT";
        if (!body.verifiedResult || typeof body.verifiedResult !== "object" || Array.isArray(body.verifiedResult)) throw new GatewayRequestError(400, "RESULT_INVALID", "verifiedResult必须是对象");
        payload = { verifiedResult: body.verifiedResult as Record<string, unknown> };
      } else {
        throw new GatewayRequestError(404, "NOT_FOUND", "端点不存在");
      }
      const output = task === "EXPLAIN_VERIFIED_RESULT"
        ? await provider.call(task, payload as { verifiedResult: Record<string, unknown> }, requestId)
        : await provider.call(task, payload as { input: string }, requestId);
      sendJson(response, 200, { ok: true, ...output });
    } catch (error) {
      applySecurityHeaders(response, responseOrigin);
      if (error instanceof GatewayRequestError) {
        sendJson(response, error.status, { ok: false, error: { type: error.type, message: error.message, requestId } });
      } else if (error instanceof GatewayProviderError) {
        sendJson(response, statusForProviderError(error.type), { ok: false, error: { type: error.type, message: error.message, requestId: error.requestId } });
      } else {
        sendJson(response, 500, { ok: false, error: { type: "GATEWAY_ERROR", message: redactError(error), requestId } });
      }
    }
  });
  return { server, config };
}

export function startGateway() {
  const { server, config } = createGatewayServer();
  server.listen(config.port, config.host, () => {
    console.log(`[building-agent-gateway] listening on http://${config.host}:${config.port}; mode=${config.publicMode ? "public" : "local"}; providerConfigured=${Boolean(config.apiKey)}; model=${config.model}`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
}

const isMain = process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;
if (isMain) startGateway();

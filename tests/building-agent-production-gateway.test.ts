import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { loadGatewayConfig } from "../tools/building-agent-gateway/config.ts";
import { createGatewayServer } from "../tools/building-agent-gateway/server.ts";

test("public gateway binds Render host and PORT only with explicit HTTPS origins", () => {
  const value = loadGatewayConfig({
    BUILDING_AGENT_PUBLIC_MODE: "true",
    BUILDING_AGENT_GATEWAY_HOST: "0.0.0.0",
    PORT: "10000",
    BUILDING_AGENT_ALLOWED_ORIGINS: "https://baileykv75-netizen.github.io",
    DEEPSEEK_API_KEY: "test-key"
  });
  assert.equal(value.publicMode, true);
  assert.equal(value.host, "0.0.0.0");
  assert.equal(value.port, 10000);
  assert.deepEqual(value.allowedOrigins, ["https://baileykv75-netizen.github.io"]);
});

test("public gateway rejects unsafe origin configuration", () => {
  assert.throws(() => loadGatewayConfig({ BUILDING_AGENT_PUBLIC_MODE: "true", BUILDING_AGENT_GATEWAY_HOST: "0.0.0.0" }), /requires an explicit/);
  assert.throws(() => loadGatewayConfig({ BUILDING_AGENT_PUBLIC_MODE: "true", BUILDING_AGENT_GATEWAY_HOST: "0.0.0.0", BUILDING_AGENT_ALLOWED_ORIGINS: "*" }), /wildcard/);
  assert.throws(() => loadGatewayConfig({ BUILDING_AGENT_PUBLIC_MODE: "true", BUILDING_AGENT_GATEWAY_HOST: "0.0.0.0", BUILDING_AGENT_ALLOWED_ORIGINS: "http:\/\/example.com" }), /https/);
  assert.throws(() => loadGatewayConfig({ BUILDING_AGENT_PUBLIC_MODE: "true", BUILDING_AGENT_GATEWAY_HOST: "127.0.0.1", BUILDING_AGENT_ALLOWED_ORIGINS: "https:\/\/example.com" }), /0.0.0.0/);
});

test("public gateway allows originless health checks but requires an allowed Origin for POST", async () => {
  const config = loadGatewayConfig({
    BUILDING_AGENT_PUBLIC_MODE: "true",
    BUILDING_AGENT_GATEWAY_HOST: "0.0.0.0",
    PORT: "10000",
    BUILDING_AGENT_ALLOWED_ORIGINS: "https://baileykv75-netizen.github.io"
  });
  const { server } = createGatewayServer({ config });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    const healthBody = await health.json() as { deploymentMode: string };
    assert.equal(healthBody.deploymentMode, "public");

    const missingOrigin = await fetch(`${baseUrl}/v1/agent/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "北墙后面有什么？" })
    });
    assert.equal(missingOrigin.status, 403);
    assert.equal((await missingOrigin.json() as { error: { type: string } }).error.type, "ORIGIN_REQUIRED");

    const preflight = await fetch(`${baseUrl}/v1/agent/query`, {
      method: "OPTIONS",
      headers: { Origin: "https://baileykv75-netizen.github.io" }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://baileykv75-netizen.github.io");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

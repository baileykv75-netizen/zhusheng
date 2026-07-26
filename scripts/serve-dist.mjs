import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const workerPath = resolve(process.cwd(), "dist/server/index.js");
const worker = (await import(pathToFileURL(workerPath).href)).default;

const server = createServer(async (incoming, outgoing) => {
  try {
    const url = `http://${incoming.headers.host || `${host}:${port}`}${incoming.url || "/"}`;
    const hasBody = incoming.method !== "GET" && incoming.method !== "HEAD";
    const request = new Request(url, {
      method: incoming.method,
      headers: incoming.headers,
      body: hasBody ? incoming : undefined,
      duplex: hasBody ? "half" : undefined
    });
    const response = await worker.fetch(request, process.env);
    outgoing.statusCode = response.status;
    response.headers.forEach((value, name) => outgoing.setHeader(name, value));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.statusCode = 500;
    outgoing.setHeader("content-type", "text/plain; charset=utf-8");
    outgoing.end(error instanceof Error ? error.message : "Worker request failed");
  }
});

server.listen(port, host, () => {
  console.log(`筑生已启动：http://${host}:${port}`);
});

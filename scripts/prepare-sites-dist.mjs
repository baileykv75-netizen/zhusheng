import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { extname, join, relative, sep } from "node:path";

const root = process.cwd();
const exportRoot = join(root, "out");
const target = join(root, "dist");

if (!existsSync(exportRoot)) {
  throw new Error("Next static export was not generated.");
}

const mimeTypes = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const textExtensions = new Set([".css", ".html", ".js", ".json", ".svg", ".txt"]);

function listFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

const assets = listFiles(exportRoot).map((file) => {
  const extension = extname(file).toLowerCase();
  const pathname = `/${relative(exportRoot, file).split(sep).join("/")}`;
  const contents = readFileSync(file);
  return [
    pathname,
    {
      body: textExtensions.has(extension) ? contents.toString("utf8") : contents.toString("base64"),
      encoded: !textExtensions.has(extension),
      type: mimeTypes[extension] || "application/octet-stream"
    }
  ];
});

const workerSource = `"use strict";

const ASSETS = new Map(${JSON.stringify(assets)});
const ALLOWED_TASKS = new Set(["structure_evidence", "explain_diagnosis", "summarize_workorder"]);
const FALLBACKS = ${JSON.stringify({
  structure_evidence: {
    summary: "接头施工完成，打压无掉压，照片及房间码齐全。",
    evidenceType: "管线接头复核",
    missingFields: [],
    taskSuggestions: ["关联W-1602-B7", "交品质智能体核验"]
  },
  explain_diagnosis: {
    summary: "停用水后仍存在微流量，潮湿位置与支管接头空间关系吻合。建议局部关阀后检修。",
    followUpQuestion: "是否授权关闭1602卫生间局部进水阀？",
    taskSuggestions: ["请求人工授权", "生成精准工单"]
  },
  summarize_workorder: {
    summary: "优先从检修口进入，更换W-1602-B7接头后完成30分钟保压。",
    evidenceRefs: ["EV-2845", "EV-2848", "BIM-1602-WATER"],
    safetyNote: "设备动作已由住户授权。"
  }
})};

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers }
  });
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function assetPath(pathname) {
  if (pathname === "/") return "/index.html";
  if (ASSETS.has(pathname)) return pathname;
  const clean = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (!clean.includes(".") && ASSETS.has(clean + "/index.html")) return clean + "/index.html";
  return pathname;
}

async function aiResponse(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "请求内容不是有效JSON" }, 400);
  }
  if (!ALLOWED_TASKS.has(payload?.task)) return json({ error: "不支持的AI任务" }, 400);

  const fallback = FALLBACKS[payload.task];
  if (!env.AI_BASE_URL || !env.AI_MODEL || !env.AI_API_KEY) {
    return json({ mode: "fallback", result: fallback, reason: "未配置AI接口，使用可复现结构化结果。" });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(env.AI_BASE_URL.replace(/\\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + env.AI_API_KEY },
      body: JSON.stringify({
        model: env.AI_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.1,
        messages: [
          { role: "system", content: "你是筑生建筑智能体的解释层。只能依据给定上下文返回JSON，不得虚构证据、改变风险等级或触发设备动作。" },
          { role: "user", content: JSON.stringify({ task: payload.task, context: payload.context }) }
        ]
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error("AI endpoint returned " + response.status);
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    const result = typeof content === "string" ? JSON.parse(content) : null;
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("invalid model JSON");
    return json({ mode: "ai", result, reason: null });
  } catch {
    return json({ mode: "degraded", result: fallback, reason: "AI调用失败，已安全回退；业务状态未受影响。" });
  }
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      const configured = Boolean(env.AI_BASE_URL && env.AI_MODEL && env.AI_API_KEY);
      return json({
        ok: true,
        service: "筑生建筑全生命周期智能体",
        version: "2.0.0",
        mode: configured ? "ai" : "fallback",
        storage: "browser-session"
      });
    }
    if (url.pathname === "/api/ai") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { allow: "POST" });
      return aiResponse(request, env);
    }

    const asset = ASSETS.get(assetPath(url.pathname));
    if (!asset) return new Response("Not found", { status: 404 });
    const cache = url.pathname.startsWith("/_next/static/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=300";
    return new Response(request.method === "HEAD" ? null : asset.encoded ? decodeBase64(asset.body) : asset.body, {
      status: 200,
      headers: {
        "content-type": asset.type,
        "cache-control": cache,
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin"
      }
    });
  }
};
`;

rmSync(target, { recursive: true, force: true });
mkdirSync(join(target, "server"), { recursive: true });
mkdirSync(join(target, ".openai"), { recursive: true });
cpSync(exportRoot, join(target, "client"), { recursive: true });
cpSync(join(root, ".openai", "hosting.json"), join(target, ".openai", "hosting.json"));
writeFileSync(join(target, "server", "index.js"), workerSource, "utf8");

console.log(`Sites dist prepared with ${assets.length} embedded assets.`);

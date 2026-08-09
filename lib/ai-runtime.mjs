const DEFAULT_TIMEOUT_MS = 8000;

const stripCodeFence = (value) =>
  String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

const parseJsonObject = (value) => {
  const parsed = JSON.parse(stripCodeFence(value));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("模型未返回 JSON 对象");
  }
  return parsed;
};

const completionUrl = (baseUrl) => {
  const normalized = String(baseUrl || "").replace(/\/+$/, "");
  return /\/chat\/completions$/i.test(normalized)
    ? normalized
    : `${normalized}/chat/completions`;
};

const validateOutput = (value, requiredKeys) => {
  for (const key of requiredKeys) {
    if (!(key in value)) throw new Error(`模型结果缺少字段 ${key}`);
  }
  return value;
};

const providerName = (baseUrl) => {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "invalid-endpoint";
  }
};

export const createAiRuntime = ({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) => {
  const config = {
    baseUrl: env.AI_BASE_URL || "",
    model: env.AI_MODEL || "",
    apiKey: env.AI_API_KEY || ""
  };
  const configured = Boolean(config.baseUrl && config.model && config.apiKey);
  let mode = configured ? "ai" : "fallback";
  let lastError = configured ? "" : "未配置AI接口，使用可复现演示回退";
  let lastCallAt = null;

  const getStatus = () => ({
    mode,
    configured,
    model: configured ? config.model : null,
    provider: configured ? providerName(config.baseUrl) : null,
    lastError: lastError || null,
    lastCallAt
  });

  const runTask = async ({
    task,
    systemPrompt,
    userPayload,
    requiredKeys,
    fallback
  }) => {
    if (!configured) {
      mode = "fallback";
      return {
        output: fallback,
        mode,
        task,
        reason: lastError
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(completionUrl(config.baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `${systemPrompt}\n只返回JSON对象，不得包含设备控制指令。`
            },
            {
              role: "user",
              content: JSON.stringify(userPayload)
            }
          ]
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`模型接口返回 ${response.status}`);
      }
      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      const output = validateOutput(parseJsonObject(content), requiredKeys);
      mode = "ai";
      lastError = "";
      lastCallAt = new Date().toISOString();
      return { output, mode, task, reason: null };
    } catch (error) {
      mode = "degraded";
      lastError =
        error?.name === "AbortError" ? "模型调用超时，已安全回退" : `模型调用失败：${error.message}`;
      lastCallAt = new Date().toISOString();
      return {
        output: fallback,
        mode,
        task,
        reason: lastError
      };
    } finally {
      clearTimeout(timeout);
    }
  };

  return { getStatus, runTask };
};

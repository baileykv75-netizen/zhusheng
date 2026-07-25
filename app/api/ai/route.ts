import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const allowedTasks = ["structure_evidence", "explain_diagnosis", "summarize_workorder"] as const;
type Task = (typeof allowedTasks)[number];

const fallbacks: Record<Task, Record<string, unknown>> = {
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
};

function validTask(value: unknown): value is Task {
  return typeof value === "string" && allowedTasks.includes(value as Task);
}

export async function POST(request: NextRequest) {
  let body: { task?: unknown; context?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求内容不是有效JSON" }, { status: 400 });
  }

  if (!validTask(body.task)) {
    return NextResponse.json({ error: "不支持的AI任务" }, { status: 400 });
  }

  const fallback = fallbacks[body.task];
  const baseUrl = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  const apiKey = process.env.AI_API_KEY;
  if (!baseUrl || !model || !apiKey) {
    return NextResponse.json({ mode: "fallback", result: fallback, reason: "未配置AI接口，使用可复现结构化结果。" });
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: "你是筑生建筑智能体的解释层。只能依据给定上下文返回JSON，不得虚构证据、改变风险等级或触发设备动作。"
          },
          { role: "user", content: JSON.stringify({ task: body.task, context: body.context }) }
        ]
      }),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error(`AI endpoint ${response.status}`);
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    const result = typeof content === "string" ? JSON.parse(content) : null;
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("invalid model JSON");
    return NextResponse.json({ mode: "ai", result, reason: null });
  } catch {
    return NextResponse.json({ mode: "degraded", result: fallback, reason: "AI调用失败，已安全回退；业务状态未受影响。" });
  }
}

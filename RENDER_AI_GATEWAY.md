# 筑生 Live AI：Render 部署说明

本方案保持前端与模型密钥隔离：

```text
GitHub Pages
https://baileykv75-netizen.github.io/zhusheng/
        ↓ HTTPS
Render Web Service
https://<service>.onrender.com
        ↓ server-side only
DeepSeek API
```

## 1. 创建 Render Blueprint

仓库根目录已提供 `render.yaml`。在 Render 中新建 Blueprint，连接：

- Repository: `baileykv75-netizen/zhusheng`
- Branch: `gpt/step4-guarded-lifecycle`

Blueprint 会创建 `zhusheng-building-agent-gateway` Web Service。

初始化时只需要手动填写一个 Secret：

```text
DEEPSEEK_API_KEY=<你的 DeepSeek API Key>
```

不要把 Key 写进 GitHub、NEXT_PUBLIC 变量、浏览器或截图。

## 2. 验证 Gateway

Render 部署完成后打开：

```text
https://<你的 Render 服务域名>/health
```

期望看到：

```json
{
  "status": "ok",
  "provider": "deepseek",
  "providerConfigured": true,
  "model": "deepseek-v4-flash",
  "deploymentMode": "public"
}
```

## 3. 把公开 Gateway URL 给 GitHub Pages

在 GitHub 仓库进入：

`Settings → Secrets and variables → Actions → Variables`

新增 Repository variable：

```text
BUILDING_AGENT_GATEWAY_URL=https://<你的 Render 服务域名>
```

这是公开 URL，不是 Secret。DeepSeek Key 仍只在 Render。

随后重新运行 `Deploy GitHub Pages` workflow，或向 `gpt/step4-guarded-lifecycle` 推送一次提交。构建时会把该 URL 注入：

```text
NEXT_PUBLIC_BUILDING_AGENT_GATEWAY_URL
```

## 4. 安全边界

生产 Gateway：

- 监听 Render 要求的 `0.0.0.0:$PORT`；
- 只允许 `https://baileykv75-netizen.github.io` 的浏览器 Origin；
- 公网 POST 缺少 Origin 会被拒绝；
- `/health` 允许 Render 的无 Origin 健康检查；
- 仍保留本地 rate limit、输入大小限制、模型输出限制和 Grounding Guard；
- AI 只能查询与提出动作，不能自行授权、执行阀门或修改生命周期状态。

## 5. 本地开发不受影响

不设置 `BUILDING_AGENT_PUBLIC_MODE=true` 时，Gateway 仍只绑定：

```text
127.0.0.1:4180
```

本地命令保持：

```bash
pnpm dev
pnpm agent:gateway
```

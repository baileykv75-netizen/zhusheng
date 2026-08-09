# 筑生公网部署（第一版）

第一版只部署可复现的确定性演示，不部署 DeepSeek 网关或任何模型密钥。

1. 在已安装 Docker Compose 的 Linux VPS 上复制项目，创建 `.env.production` 并填入已解析到该服务器的域名。
2. 运行 `docker compose up -d --build`。
3. 使用 `https://<PUBLIC_DOMAIN>/api/health` 确认健康检查返回 `ok: true`。

容器内部端口固定为 `4173`，仅由 Caddy 反向代理；浏览器会话仍保存在访客本地，不写入服务器。

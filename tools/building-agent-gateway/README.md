# 筑生总智能体 DeepSeek 网关

该网关只为阶段6B提供三类服务端任务：观察解释、只读工具建议、确定性结果解释。诊断、状态机、授权、阀门动作、维修闭环和集团评审仍由本地确定性领域模块负责。

## Windows 启动

1. 在仓库根目录`.env`的`DEEPSEEK_API_KEY=`后填写密钥。
2. `DEEPSEEK_MODEL`默认使用`deepseek-v4-flash`，可按账号实际权限改为其他DeepSeek模型。
3. 启动网关：`pnpm run agent:gateway`
4. 另一个终端启动网站：`pnpm run dev`
5. 健康检查：`GET http://127.0.0.1:4180/health`

网关默认只监听`127.0.0.1`，只允许配置的前端Origin。`/health`只返回Provider、是否配置、模型名和服务状态，不返回密钥。

## 输出校验

DeepSeek调用`https://api.deepseek.com/chat/completions`并启用JSON Output。JSON Output保证返回JSON格式，随后仍由本地严格Schema检查字段、枚举、数值范围、BusinessId和只读工具子白名单；任何不合规内容都被拒绝并回退确定性模式。

## 安全边界

- 上游地址固定，不接受浏览器指定API地址、模型或系统提示词。
- 模型只能返回结构化草稿、只读工具建议或确定性结果解释。
- 模型建议必须经过Schema、只读子白名单、会话阶段和参数来源复核。
- 浏览器不读取、保存或上传API密钥。
- 轨迹是演示级防篡改记录，不是数字签名。

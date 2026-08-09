# 筑生总智能体（阶段6A/6B）

本模块是现有确定性能力的可审计编排层，不是新的诊断器。默认使用确定性意图路由和字段提取，无需API。

## 边界

- 语言层只能理解意图、形成待确认草稿、选择白名单工具和解释结果。
- 建筑身份、拓扑、诊断评分、状态跳转、授权守卫、维修复验、审计与集团治理继续由原领域模块负责。
- `request_human_authorization`只创建请求；批准与设备模拟动作不在工具白名单中。
- 未确认草稿不能进入正式事件。
- 调用轨迹是演示级防篡改哈希链，不是数字签名或区块链。
- 当前仅覆盖脱敏合成的1602卫生间潮湿/疑似渗漏案例。

## Provider

`BuildingAgentProvider`允许接入仅负责意图、字段提取和确定性结果解释的增强Provider。阶段6B的`DeepSeekGatewayBuildingAgentProvider`只访问本机网关，不读取密钥。DeepSeek JSON Output之后仍需通过本地严格Schema、真实模型只读子白名单和会话守卫；失败、超时或格式错误会回退到确定性模式。

真实模型只允许建议`query_building_memory`、`locate_component`、`list_required_evidence`、`draft_observation`、`explain_decision`、成果包与集团经验验证读取、以及工作台导航。正式证据提交、事件评估、授权请求、维修任务、授权批准、阀门动作和状态写入均不暴露给模型。用户确认后，领域编排器才按既有确定性流程执行。

服务端实现、环境变量和启动方式见`tools/building-agent-gateway/README.md`。若没有真实API密钥，确定性模式仍完整可用，不得把模拟Provider测试描述为真实模型调用。

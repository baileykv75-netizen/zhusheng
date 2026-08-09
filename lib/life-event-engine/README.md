# 建筑生命事件引擎

事件引擎在动态诊断、拓扑遍历和人工授权主链上增加不可变输入、时间守卫、结构化维修闭环与事件产物重放。核心仍为独立TypeScript纯逻辑；`/resident`只通过浏览器适配器调用它，不复制规则，不接入真实设备或大模型API。

## 主要模块

- `canonical.ts`：属性顺序无关的规范化、SHA-256内容哈希和同ID不可变合并。
- `schemas.ts`：物理范围、事件时间、设备空间/系统关系、证据类型及来源校验。
- `evidence-evaluator.ts`：只使用有效最新修订；无基线不形成强异常，照片使用受控含义。
- `topology-traversal.ts`：从建筑记忆连接图查询候选接头、阀门、水表和传感器。
- `rules.ts`：透明规则集`ZS-LE-1.1.0`；分值用于排序，不是故障概率。
- `state-machine.ts`：隔离确认、维修记录、恢复供水及维修后验证的带守卫状态机。
- `authorization.ts`：授权绑定事件、动作、阀门和人工参与者。
- `event-log.ts`：引用输入、证据、决策快照的顺序SHA-256哈希链。
- `replay.ts`：验证快照、哈希链、状态连续性、授权关系并恢复状态、阀门位置和最后决策。
- `repair-task.ts`：从第一候选、空间层级和连接图生成精准维修任务，不写死目标接头。
- `event-package.ts`：校验并生成事件成果包、维修记录历史、授权、复验和追加式建筑记忆补丁。
- `visual-directive.ts`：只输出manifest中存在的视图、节点、状态和证据锚点。

## 不可变与时间规则

相同观察、证据、授权或维修记录ID只能幂等重复。内容变化必须使用新ID；证据和维修记录修订通过`supersedesId`和`revisionReason`保留完整历史。隔离证据必须引用已经写入审计链的模拟关阀sequence、目标阀门和动作后的新流量/湿度观察。

隔离后指标恢复只进入`ISOLATION_CONFIRMED`和`REPAIR_PENDING`。只有物业维修记录、单独授权的模拟恢复供水，以及维修后的新流量与湿度观察全部有效，事件才可进入`RESOLVED`并输出`REPAIRED`视觉状态。

## 动作输出

结果明确区分：

- `proposedActions`
- `authorizationRequests`
- `authorizedActions`
- `completedActions`

未授权时视觉指令最多收到`REQUEST_HUMAN_AUTHORIZATION`，不会收到可执行关阀动作。

## 产物验证与重放

```powershell
pnpm run event:simulate -- --scenario repair-and-post-verification --json
pnpm run event:verify-artifact -- --input artifacts/life-events/EVT-1602-REPAIR-001.json
pnpm run event:replay -- --input artifacts/life-events/EVT-1602-REPAIR-001.json
```

事件成果包保存不可变输入、证据和决策快照、维修任务、维修记录与修订历史、两次动作授权、维修后观察和审计日志。重放恢复最终状态、阀门位置和最后一次决策摘要，并与产物声明交叉验证。成果包还包含追加式`event-memory-patch`，不会覆盖建筑记忆种子。

该SHA-256链是**演示级防篡改链**，用于发现删除、调序和内容修改；它不是数字签名、外部时间戳或抵御恶意攻击的可信基础设施。

> 脱敏合成演示事件，不作为真实诊断或设备控制依据。

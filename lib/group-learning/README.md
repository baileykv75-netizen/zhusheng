# 集团经验反哺与人工治理

`lib/group-learning/`只接收阶段4B已经验证且最终状态为`RESOLVED`的建筑生命事件成果包。模块以纯TypeScript实现，不调用大模型API，也不连接真实集团、物业或设备系统。

## 领域链路

```text
VerifiedLifeEventPackage
-> GroupLearningCard (SINGLE_CASE_HYPOTHESIS)
-> Human Review Audit
-> PilotQualityChecklistItem (PILOT_ONLY)
```

- `source-validator.ts`：重新验证事件成果包、审计重放、维修记录、维修后观察和建筑记忆引用。
- `generator.ts`：生成证据链、单事件经验卡和工友证据贡献。
- `rules.ts`：根据IFC构件类型和实际维修方式生成具体试点检查动作。
- `review.ts`：人工评审状态机、追加式哈希链、重放和试点检查项生成。
- `verification.ts`：下载前验证来源、经验卡、贡献记录、评审链与检查项一致性。
- `adapters/browser`：通过静态资产与Web Crypto加载，不引入Node专用模块。
- `adapters/node`：用于测试、离线导出和验收产物生成。

## 人工治理边界

当前只有一个1602卫生间脱敏演示事件，经验等级固定为`SINGLE_CASE_HYPOTHESIS`。系统不能自动批准。只有明确的集团演示评审人选择`APPROVE_AS_PILOT_CHECK`后，才生成状态为`PILOT_ONLY`的检查项。

若评审状态为`RETURNED_FOR_EVIDENCE`或`HELD_WITHOUT_ADOPTION`，下一次决定必须记录新的结构化补充证据、重新提交原因和递增的评审轮次。旧决定与补证内容继续保留在追加式哈希链中，不能被直接覆盖或无补证改判。

以下内容不由本模块产生：集团规律、系统性缺陷、企业标准、班组责任、真实成本节省或真实故障率改善。

评审审计是演示级顺序哈希链，不是数字签名或外部可信签名。

## 资产与导出

```powershell
pnpm run sync:group-learning-assets
pnpm run check:group-learning-assets
pnpm run group:export -- --decision approve --reviewer GROUP-REVIEWER-DEMO-01 --comment "仅采纳为试点检查项，不升级为企业标准。"
```

导出命令必须显式提供人工决定、评审人和意见；缺少任一项时拒绝执行。

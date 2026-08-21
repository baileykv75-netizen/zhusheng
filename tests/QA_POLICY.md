# 筑生 QA Policy

本文件定义当前产品验收真值与历史阶段 QA 的边界。目的不是删除历史脚本，而是防止旧交互、旧状态机假设或旧页面结构被误当成当前产品合同。

## 1. 当前产品真值

当前 `gpt/step4-guarded-lifecycle` 的验收顺序：

1. `pnpm run typecheck`
2. `pnpm test`
3. 启动 `pnpm dev` 后运行 `pnpm run test:qa:current`
4. `pnpm run security:scan`
5. `pnpm run build:next`
6. `pnpm run test:pages-export`

其中 `test:qa:current` 包含五条当前浏览器 QA：

- `test:css-delivery`：当前产品壳、样式交付、响应式与静态资源完整性。
- `test:spatial-drilldown`：真实 `hero-glb` 加载、Building → 16F → 1602 → 卫生间用户控制下钻、返回与 breadcrumb、无自动跳转、Case 空间交接与移动端无横向溢出。
- `test:component-life`：Case 中共享空间选择驱动 3D → 对象生命索引反查；验证对象身份、历史记忆、系统归属、证据/维修聚合、无事件时不虚构当前候选、`?object=<businessId>` 深链接双向同步/非法 ID 清理，以及 Building Memory → canonical 对象生命的跨角色交接和 390px 可用性。
- `test:evidence-correctness`：Product Evidence / Domain Evidence、人工观察、来源、独立物业复核与 PRODUCT_ONLY 边界。
- `test:v6-lifecycle`：住户事实 → 物业确定性评估 → 人工授权 → 设备动作 → 隔离验证 → 维修证据 → 独立恢复授权 → 维修后复验 → PILOT_ONLY。

`tests/evidence-correctness-qa.mjs` 与 `tests/v6-lifecycle-qa.mjs` 是稳定入口，实际分别加载当前 v2 脚本；`tests/spatial-drilldown-qa.mjs` 直接验证当前空间连续性；`tests/component-life-qa.mjs` 验证共享 `selectedBusinessId`、可分享对象 URL 与跨角色对象交接保持一致。

当前浏览器 QA 必须可在开发机与 GitHub Actions/Linux headless Chromium 中一致运行：
- URL 断言必须兼容 `next.config.ts` 的 `trailingSlash: true`，不能把 `/case-1602/` 误判为失败。
- Playwright 优先使用项目运行时依赖；Codex 本地环境允许通过 `CODEX_PLAYWRIGHT_MODULE` 或既有 runtime fallback 加载，不要求把 Playwright 永久写入产品依赖。
- Spatial QA 在无硬件 GPU 的 CI runner 上允许使用 SwiftShader 软件 WebGL；这只是浏览器测试运行方式，不降低“必须加载真实 `hero-glb`”的产品验收要求。

## 2. 当前产品的不可回退语义

以下规则优先于任何历史视觉脚本：

- Scripted demo 不能 seed formal lifecycle。
- Resident Product Evidence 不会自行运行确定性诊断。
- `PRODUCT_ONLY` 事实不会进入漏水 pending assessment。
- 图片被选择不等于人工确认了照片中的现象。
- 物业必须独立确认本轮系统/现场观测后，第一次确定性评估才能形成正式事件。
- 关阀授权与恢复供水授权是两个独立门禁。
- 授权本身不执行设备动作。
- 维修提交需要当前维修证据身份与明确人工确认。
- 维修后复验需要新的证据身份与明确人工确认。
- Case 当前叙事是 `过去 / 此刻 / 处置 / 结果` 四阶段。
- Building → 16F → 1602 → 卫生间是用户控制的空间下钻，不是定时自动播放。
- 首页空间下钻的当前验收要求真实 `hero-glb` 成功加载；程序化 fallback 只用于产品降级，不代表主视觉空间资产验收通过。
- Case 中事实 → 3D 与 3D → 对象生命索引都必须复用结构化 `businessId`；不能从住户自然语言或视觉文案猜测构件身份。
- 对象生命索引可以展示历史、证据、系统归属和维修留痕，但历史相关性不能升级成当前故障结论；`pending reassessment` 时不得复用上一轮候选身份。
- `/case-1602?object=<businessId>` 只接受 `building1602Dataset.components` 中真实存在且属于 `SPACE-1602-BATHROOM` 的对象；未知 ID、空间 ID、系统 ID 或越界对象不能凭 URL 生成实体、事件、证据或候选身份。
- 对象深链接只交接“正在查看哪个对象”。待首次评估/重新评估时，它可以保留对象生命索引的身份上下文，但不能绕过既有候选遮罩、恢复上一轮诊断或改变事件状态。
- Canonical 对象链接使用 `/case-1602?object=<businessId>`；除非用户确实从 Building 空间下钻进入，否则分享链接不得伪造 `entry=building` 来源语义。
- Building Memory / Property / Event / Building Agent 的跨角色交接必须统一复用 canonical 对象链接，只能传递结构化对象身份与来源，不能创建或改变事件、候选、授权、设备动作、维修状态。
- Property / Event 在 `pending assessment` 或 `pending reassessment` 时不得重新暴露上一轮候选、授权对象或维修目标；当前交接必须等待本轮确定性评估重新形成。
- Building Agent 对象交接只能来自结构化 `visualDirective.targetBusinessIds` / `revealBusinessIds` / `selectedBusinessId`；禁止从回答自然语言中猜测对象。
- 单事件经验最多进入 `PILOT_ONLY`，不会自动升级为企业标准。

## 3. 历史阶段 QA

以下脚本保留用于回看某个历史阶段或视觉证据，但**不代表当前产品验收**：

| key | 文件 | 状态 / 原因 |
| --- | --- | --- |
| `exhibit` | `tests/exhibit-qa.mjs` | 明显过时：仍假定首页一次点击自动下钻、Case 五章节、旧 AI workspace 与固定证据时间线。 |
| `resident-task` | `tests/resident-task-qa.mjs` | 早期 resident task 视觉快照；可用于布局回看，但不是当前 Evidence/Lifecycle 真值。 |
| `stage4a` | `tests/stage4a-visual-qa.mjs` | 历史自由实验验收；部分守卫仍有参考价值，但不能替代当前住户受理流程。 |
| `stage4b` | `tests/stage4b-visual-qa.mjs` | 明显过时：维修记录与维修后复验没有当前“新证据身份 + 人工确认”门槛。 |
| `stage5` | `tests/stage5-visual-qa.mjs` | 历史集团学习视觉验收；当前治理真值以 V6 lifecycle / Node regression 为准。 |
| `journey` | `tests/journey-visual-qa.mjs` | 历史 product journey；包含旧首页/智能体交互假设。 |
| `unified` | `tests/unified-lifecycle-visual-qa.mjs` | 明显过时：仍假定总智能体可以 seed 一个正式 lifecycle session，与当前 truthfulness 规则冲突。 |

旧命令名仍保留，但默认由 `tests/legacy-qa-guard.mjs` 阻断，避免误把历史脚本当成现行验收。例如：

- `pnpm run test:exhibit` → 阻断并说明原因。
- `pnpm run test:legacy:exhibit` → 显式运行历史脚本。

显式运行历史脚本只表示“我要查看这个历史阶段”，**运行通过也不能证明当前产品通过验收**。

## 4. 修改 QA 的规则

以后修改产品时：

1. 先更新 Node regression / 当前 browser QA，保证测试表达的是产品真值。
2. 不为了让旧 QA 变绿而回退当前产品行为。
3. 如果历史脚本仍有可复用价值，应把有效断言迁移进当前 QA，而不是直接恢复旧脚本的权威地位。
4. 新增现行浏览器 QA 时，应加入 `test:qa:current`，并同步更新本文件和 `tests/qa-policy.test.ts`。
5. CI 的当前浏览器验收应调用统一入口 `pnpm run test:qa:current`，避免 workflow 与本地验收出现两套定义。

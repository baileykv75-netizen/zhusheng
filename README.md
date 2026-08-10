# 筑生：一栋房子一生的AI智能体

## 当前演示入口

V6 将产品收束为“建筑生命事件系统”，首页只回答一个判断：

> **一栋房子不该在交付那天失去记忆。**

- `/`：建筑生命首页。用连续建筑剖面呈现“建造不失忆、居住有回应、经验会生长”。
- `/events`：建筑事件中心。展示一栋楼正在发生什么；五个事件中只有1602具备完整深链，其余为明确标注的脱敏合成概览。
- `/case-1602`：1602建筑生命事件。沿`施工留痕 → 潮湿发现 → 人工授权 → 维修复验 → 经验回流`进入唯一完整样板。
- `/worker`：工友留痕。采集施工记录与本地照片，不承担入住后的诊断或责任认定。
- `/resident`：住户服务。只负责报告现象、补充观察、人工授权和查看结果。
- `/property`：物业专业工作台。负责诊断、隔离执行、维修记录和维修后复验。
- `/group`：集团经验治理。只从已验证的`RESOLVED`事件形成单事件经验，经人工审批后最多进入`PILOT_ONLY`试点。

界面中的 BIM / GLB 定位画面来自仓库事实资产；AI生成图片均明确标注为脱敏合成演示，不能被当作真实现场证据。

本地演示统一使用 [http://127.0.0.1:4174](http://127.0.0.1:4174)。运行 `start-zhusheng.cmd`，或执行 `pnpm run dev`；生产静态演示使用 `pnpm run build && pnpm run serve`。Docker 与 HTTPS 部署见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。公网容器不包含 DeepSeek 网关，也不读取模型密钥。

## 历史实现与深链说明

现有确定性引擎与四个角色页面完整保留，作为1602建筑生命事件的深链。旧七阶段任务线、自然语言草稿和专业界面不再承担首页叙事；用户从事件中心进入需要的具体环节后，才调用对应的确定性事件引擎。

```text
描述问题 → 核对事实 → 调取建造记忆 → 联合诊断
→ 人工授权与隔离验证 → 维修与复验 → 集团经验回流
```

`/worker`、`/resident`、`/property`和`/group`按角色分工，不再与首页并列争夺首屏。住户页不展示工程参数和专业三维操作；物业页承接诊断、设备动作、维修与复验；集团页的证据链、工友贡献、审计和下载按需展开。四个角色页均可回到1602建筑生命事件或整栋楼事件中心。

界面使用`lib/journey/`将现有演示快照、生命事件状态和集团评审状态翻译为用户可读的七阶段与唯一主操作。该解析层只读领域状态，不能推进事件、批准授权或改变阀门。

## 阶段5：建筑生命经验回流

`/group`现提供“经验决策 / 高级治理”两种模式；引导演示活动时仍可显示当前闭环。经验决策只读取阶段4B已验证、可重放且最终为`RESOLVED`的事件成果包；来源被修改、引用缺失或复验未完成时拒绝生成经验卡，不会静默回退为预设建议。

当前经验等级固定为“单事件待验证经验”。系统不能自动采纳，集团演示评审人只能选择：采纳为试点检查项、退回补证或暂不采纳。批准后生成的检查项状态为`PILOT_ONLY`，不是企业标准。

工友贡献记录只提取在诊断、维修任务和事件记忆补丁中实际使用的施工证据，用于证明“施工记录在入住后继续发挥作用”，不得用于责任认定、处罚或绩效排名。

```powershell
pnpm run sync:group-learning-assets
pnpm run check:group-learning-assets
pnpm run test
pnpm run test:stage5-visual
```

完整边界见`lib/group-learning/README.md`。所有数据均为脱敏合成演示数据，不作为施工依据，不代表真实项目、物业、设备或集团经营成果。

## 阶段6A：一栋楼一个总智能体

首页本身就是筑生总智能体工作台，不再通过侧边抽屉唤醒。总智能体以`lib/building-agent/`为纯TypeScript编排核心，默认采用无需API的确定性意图路由，将自然语言先整理为可编辑、待确认的结构化草稿；只有用户确认后，才调用现有建筑记忆、拓扑查询和生命事件引擎。首页不复制住户维修或集团评审流程，而是展示事实、推断、不确定项和唯一下一步，来源、真实工具调用轨迹与哈希统一收进“验证详情”。

工具白名单不包含批准授权、开关阀、直接写状态、修改审计或自动批准集团建议。可替换Provider接口只允许意图识别与字段提取，输出必须通过Schema和白名单；失败、超时或格式错误会回退到确定性模式。浏览器不保存API密钥。

总智能体会话使用独立的`sessionStorage`键`zhusheng.building-agent.v1`，支持刷新恢复与标签页隔离。`AgentTraceLog`为追加式演示哈希链，可检测修改、删除和调序，但不是数字签名。集团评审同时增加守卫：`RETURNED_FOR_EVIDENCE`或`HELD_WITHOUT_ADOPTION`后，必须补充新证据、重新提交并进入新评审轮次，不能直接改为采纳。

```powershell
pnpm run typecheck
pnpm run test
pnpm run test:stage6a-visual
```

所有能力仍仅覆盖1602卫生间这一条脱敏合成演示链路，不连接真实项目、物业或设备；可选大模型只增强语言理解与解释，不参与领域决策。

## 阶段6B：可选DeepSeek增强网关

`tools/building-agent-gateway/`提供独立、仅监听本机回环地址的服务端网关。网关固定调用DeepSeek Chat Completions，只允许`INTERPRET_OBSERVATION`、`PROPOSE_READ_ONLY_TOOLS`和`EXPLAIN_VERIFIED_RESULT`三类任务；模型只能提出结构化草稿、只读工具建议或解释已经验证的确定性结果。模型建议、本地批准、实际执行和安全拒绝在界面中分别记录。

```powershell
Copy-Item .env.example .env
# 只在未纳入版本控制的.env中填写DEEPSEEK_API_KEY，并按账号权限设置DEEPSEEK_MODEL
pnpm run agent:gateway
# 另一个终端
pnpm run dev
```

未配置密钥、余额不足、模型不可用、网络中断、超时、限流或JSON与本地Schema校验失败时，前端自动使用阶段6A确定性模式。默认模型配置为`deepseek-v4-flash`，若账号不可用会明确报错，不会静默切换。真实验收命令为`pnpm run agent:live-smoke`；只有该命令获得真实响应ID后，才会生成`artifacts/stage6b/live-deepseek-smoke.json`和`live-deepseek-trace.jsonl`。

## 阶段4B：1602维修闭环与可验证事件包

`/resident`提供“任务处置”和“高级实验”两种互不污染的模式。高级实验在浏览器本地调用生命事件引擎，支持调整湿度、微流量、施工记录、住户照片和水表观察，并将引擎生成的`VisualDirective`应用到1602卫生间GLB。隔离确认后可继续生成精准维修任务、提交不可变维修记录、单独申请恢复供水授权、明确执行模拟开阀并提交维修后新观察。

```powershell
pnpm run sync:life-event-assets
pnpm run check:life-event-assets
pnpm run dev
```

BIM目录仍是事实源，`public/assets/life-event/`只保存经过SHA-256校验的网页副本。`bathroom-1602.runtime-transforms.json`由现有Blend后台导出，用于恢复原GLB中被零尺度和`-64`偏移隐藏的节点；它不修改IFC、Blend或原GLB。

自由实验状态使用独立的`sessionStorage`键`zhusheng.life-event-lab.v2`。关阀与开阀分别授权，批准授权后阀门仍保持原位置，只有用户明确执行且事件引擎接受后才改变。维修后正常观察进入`RESOLVED`并输出`REPAIRED`；持续异常进入`REOPENED`；低质量数据不会关闭事件。

终态事件可下载“1602建筑生命事件包”、JSONL审计日志和浏览器打印版中文闭环报告。下载前自动验证审计哈希链、事件重放、最终状态和引用完整性，并生成追加式`event-memory-patch`，不会修改`building-memory.seed.json`。所有数据均为脱敏合成演示数据，不连接真实设备，也不使用大模型进行诊断。

“筑生”是一套建筑全生命周期智能体交互样机。每栋建筑从项目启动时拥有唯一总智能体：建造期帮助工友形成可信的建筑生命记忆，入住后调用这些记忆、传感器和设备接口服务住户、物业与企业。

作品坚持“一套系统、一个主入口、一条闭环”：

- `/`：筑生总智能体工作台，统一理解问题、编排工具和指向唯一下一步。
- `/worker`：按需进入的施工证据采集工具，区分原始口述、AI结构化和品质核验。
- `/resident`：按需进入的诊断、授权、维修与高级实验工具。
- `/group`：按需进入的集团人工治理工具，形成有边界的单事件经验和`PILOT_ONLY`检查项。
- 唯一完整样板：1602卫生间渗漏，从工友留痕到维修验证。

V5使用连续视觉叙事呈现同一对象从建筑、空间、隐蔽构件、表面异常、设备动作、维修验证到集团知识反馈的变化。核心场景按需预取，现场证据可在页面内展开查看。

## 本地运行

需要 Node.js 20 或更高版本。Windows可双击：

```text
start-zhusheng.cmd
```

首次运行会安装依赖、生成静态页面和纯Worker生产版本，随后打开 `http://127.0.0.1:4174`。结束时双击 `stop-zhusheng.cmd`。

开发模式：

```powershell
npm install
npm run dev
```

## 公网与会话

公开站点不设置登录。Next页面采用静态导出，标准ESM Worker负责页面资源、健康检查和可选AI接口。演示状态保存在每台设备的 `sessionStorage` 中，访客之间互不影响；刷新可恢复本设备进度，重置可回到初始状态。图片只做浏览器本地预览，不上传云端。

可使用 `/?demo=1` 直接进入七步引导演示。

## AI边界

`POST /api/ai` 只接受三类无状态任务：

- `structure_evidence`
- `explain_diagnosis`
- `summarize_workorder`

配置 `AI_BASE_URL`、`AI_MODEL`、`AI_API_KEY` 后可接兼容式模型接口。未配置或调用失败时，界面显示“演示回退”或“降级运行”。AI不能修改风险等级、授权状态、阀门状态或事件关闭条件。

## 验证

```powershell
npm run typecheck
npm test
npm run build
```

浏览器验收脚本为`tests/visual-qa.mjs`、`tests/stage4a-visual-qa.mjs`和`tests/stage4b-visual-qa.mjs`，覆盖桌面、390px手机、会话隔离、双授权、维修复验、成果包下载和GLB降级。

V5网页资产位于 `public/assets/v5`，仅作为历史回退资产；概念展厅与1602验证舱不以这些生成式视觉作为主线。可追溯模型资产位于`bim/`和`public/assets/life-event/`。

## 建筑生命事件引擎

`lib/life-event-engine/`提供独立、纯逻辑、可测试的TypeScript事件引擎。它读取`bim/data/building-memory.seed.json`与`bim/visual/bathroom-1602.manifest.json`，通过通用连接图、透明规则、不可变证据、结构化维修记录、人工授权和顺序哈希链处理1602卫生间唯一潮湿/疑似渗漏案例。`/resident`自由实验通过浏览器适配器调用同一份核心规则，UI不计算诊断分值或直接修改事件状态。

使用仓库现有pnpm环境运行：

```powershell
pnpm run event:simulate -- --scenario joint-leak-supported --json
pnpm run event:simulate -- --scenario humidity-only --json
pnpm run event:simulate -- --scenario missing-evidence --json
pnpm run event:simulate -- --scenario contradictory-evidence --json
pnpm run event:simulate -- --scenario post-isolation-recovery --json
pnpm run event:simulate -- --scenario repair-and-post-verification --json
pnpm run event:simulate -- --scenario preloaded-recovery-evidence --json
pnpm run event:verify-artifact -- --input artifacts/life-events/EVT-1602-REPAIR-001.json
pnpm run event:replay -- --input artifacts/life-events/EVT-1602-REPAIR-001.json
```

也可使用`--input <json>`读取外部合成输入，或使用`--set observations.humidity.value=88`覆盖场景观测值。结果与JSONL审计日志写入`artifacts/life-events/`。

规则版本为`ZS-LE-1.1.0`。规则分值用于候选排序，不是真实故障概率；未授权时阀门始终保持`OPEN`。审计SHA-256链是演示级防篡改链，不是数字签名。详细边界见`lib/life-event-engine/README.md`。

## 素材替换

当前建筑图为脱敏样板。正式提交前替换：

- 企业Logo：SVG优先，或透明背景PNG。
- BIM/项目图：PNG/JPG，建议宽度不低于1920px。
- VI色值：当前企业红临时使用 `#C92A2A`。

素材必须移除住户信息、真实房号、人员姓名、坐标和嵌入元数据。

## 打包

```powershell
npm run package:submission
```

输出 `outputs/zhusheng-digital-building-agent.zip`，不包含 `.env`、密钥、缓存或构建产物。

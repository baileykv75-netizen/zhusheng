# 筑生：一栋房子一生的 AI 智能体

筑生把建筑在设计、施工、交付、入住、维修和复验中产生的事实，组织成可定位、可追溯、可验证的建筑生命记忆。

> 一栋房子不该在交付那天失去记忆。

当前版本是一套脱敏合成的比赛演示产品。它有完整的建筑级叙事和一个真实连接确定性领域引擎的样板事件：1602 卫生间潮湿及疑似渗漏。

## 产品入口

- `/`：建筑生命首页。建筑本身是主界面，可下钻至 16 层、1602 户和卫生间。
- `/events`：建筑生命事件中心。展示 5 个脱敏合成事件；只有 1602 有完整处理深链。
- `/case-1602`：1602 建筑生命事件，按“施工留痕 → 潮湿发现 → 人工授权 → 维修复验 → 经验回流”推进。
- `/worker`：工友留痕。保留原始信息、AI 建议和人工确认后的正式记录。
- `/resident`：住户服务。只负责报告现象、补充照片/观察、授权和查看结果。
- `/property`：物业专业工作台。负责事件接收、建造记忆、诊断、隔离执行、维修和复验。
- `/group`：集团经验治理。已验证事件经人工审批后最多形成 `PILOT_ONLY` 试点检查项。

页面中的 BIM / GLB 定位画面来自仓库已有事实资产。AI 生成图片全部标注 `AI_GENERATED · DEMO_SYNTHETIC`，只用于合成演示，不冒充真实项目照片或真实现场证据。

## 本地运行

建议使用 Node.js 20+ 与 pnpm。

开发模式：

```powershell
pnpm install
pnpm run dev
```

生产演示：

```powershell
pnpm run build
pnpm start
```

统一访问地址：<http://127.0.0.1:4174>

Windows 也可使用仓库根目录的 `start-zhusheng.cmd` 和 `stop-zhusheng.cmd`。

## 验证

```powershell
pnpm run typecheck
pnpm test
pnpm run build
pnpm run test:exhibit
pnpm run test:v6-lifecycle
```

`test:exhibit` 覆盖 1440、1024、768 和 390 四档宽度，并检查：

- 首页建筑下钻与 16 层聚焦；
- 1602 五阶段锁定和唯一下一步；
- 五张合成证据的时间链；
- 住户、物业、工友、集团角色边界；
- 1602 四种数字样间视图；
- 静态资源、运行时错误、横向溢出和深链返回。

`test:v6-lifecycle` 通过真实浏览器按状态机顺序走完住户补证与授权、物业关阀与维修、独立开阀授权、维修后新照片复验和集团三种人工治理结果；它同时检查维修照片与复验新照片的必填门槛。

## 技术边界

- `lib/life-event-engine/` 是诊断、状态、授权、维修、复验和审计的唯一领域事实源，UI 不计算诊断结论。
- 关阀与开阀分别授权；授权后仍需人工明确执行。
- 维修结果必须由新的观察复验；异常仍可进入 `REOPENED`。
- 审计 SHA-256 链是演示级防篡改链，不是数字签名。
- 单事件不能自动升级为企业标准；集团审批结果最高为 `PILOT_ONLY`。
- 浏览器上传仅做当前设备本地预览，不上传云端。
- 可选大模型只增强语言理解与解释，不能授权、操作设备、改写事件状态或批准集团规则。

## 关键事实资产

- `bim/output/ZS-DEMO-001.ifc`：18 层 MiC 住宅 IFC。
- `bim/data/building-memory.seed.json`：建筑记忆种子。
- `bim/visual/bathroom-1602.blend`：1602 数字样间源文件。
- `public/assets/life-event/bathroom-1602.glb`：网页运行时数字样间。
- `public/assets/life-event/bathroom-1602.manifest.json`：视图、节点、身份和性能清单。

## GitHub Pages

项目仓库：<https://github.com/baileykv75-netizen/zhusheng>

发布地址：<https://baileykv75-netizen.github.io/zhusheng/>

Pages 使用 `/zhusheng` 子路径。工作流会先同步运行时资产，再执行领域测试、生产构建、子路径与静态资源检查。功能分支通过 PR 验证；合并到 `main` 后才发布生产站点。

## 其他部署

Docker Compose + Caddy 部署见 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)。第一版公网容器只运行确定性演示，不包含 DeepSeek 网关、模型密钥或真实设备连接。

完整完成度矩阵见 [`docs/V6_COMPLETION_AUDIT.md`](docs/V6_COMPLETION_AUDIT.md)，交付说明见 [`docs/V6_DELIVERY_REPORT.md`](docs/V6_DELIVERY_REPORT.md)。

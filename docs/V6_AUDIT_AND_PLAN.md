# 筑生 V6 审计与实施基线

## 现状理解

- 仓库已有完整的 Semantic Twin：IFC、建筑记忆、稳定身份、空间/系统拓扑、1602 GLB、manifest 与 runtime transforms。
- `LifecycleJourneyProvider` 已经把浏览器会话、生命事件引擎、双授权、维修记录、维修后复验和成果包串在同一状态源中；V6 不需要也不允许另建状态机。
- `/` 当前是暖白色静态概念展厅，主体仍是 SVG 建筑剖面；概念已收束，但缺少“建筑就是界面”的空间冲击力。
- `/case-1602` 已有五阶段映射，但未来章节仍是普通链接，尚未真正锁定。
- `/resident` 仍同时承担现场输入、专业诊断、阀门执行、维修和复验，角色边界不真实。
- `/group` 已有严格的人工评审与 `PILOT_ONLY` 治理，但首屏仍是单事件工作台，缺少多建筑尺度。
- `/events` 与 `/property` 尚不存在；`/worker` 有施工记录闭环，但本地图片上传和“原话 / AI建议 / 正式记录”层级仍需加强。
- 现有 1602 Visual Twin 的几何、身份和四视图可靠，但材质、灯光、相机运动与局部剖切仍呈验证模型质感。

## 可复用模块

- `lib/life-event-engine/`：所有诊断、状态、授权、维修、复验和审计的唯一领域事实源。
- `components/lifecycle-journey-provider.tsx`：跨页面共享的浏览器会话和动作入口。
- `lib/journey/`：把技术状态翻译为中文任务和唯一下一步的产品层。
- `BathroomTwinViewport` + `scene-controller`：1602 GLB 的视图、构件、高亮、阀门和证据锚点运行时。
- `lib/group-learning/`：单事件经验、人工评审、补证重提和 `PILOT_ONLY` 输出。
- `lib/building-agent/`：自然语言草稿、人工确认、只读工具编排和模型安全边界。
- `bim/visual/`：Visual Twin 派生的语义基线与回归验证入口。

## 风险点

- 不能让视觉状态反向写入领域状态；授权与执行必须继续分离。
- Premium GLB 必须映射回现有 BusinessId / GlobalId / manifest，原始 GLB 保留为 fallback。
- GitHub Pages 使用 `/zhusheng` 子路径；所有公开资源和客户端路由都必须兼容 `basePath`。
- Docker 仍使用 Node 20，而 TypeScript strip-types 脚本实际需要更高 Node 版本；README、容器和本地端口仍有 4173/4174 混用。
- `globals.css` 已很大，V6 样式应隔离成独立视觉层，避免继续污染旧工作台。
- 现有建筑与卫生间渲染只能作为几何/事实参考，不能直接冒充现场证据。

## 修改边界

- 不修改 IFC、building-memory seed、领域规则分值、状态机、双授权、审计链和集团治理规则。
- 新增产品层的 Event Summary、Building Task、角色视图和合成演示数据；只有 1602 连接完整领域引擎。
- 新增 Visual Twin 派生资产和运行时表现，但所有可交互对象继续由 Semantic Twin 标识映射。
- AI 图片统一标记“AI生成 · 脱敏合成演示”，只承担概念关键帧或演示证据角色。
- 每个阶段完成后执行 typecheck、领域测试、静态构建和对应视觉 QA；最终再同步 GitHub Pages。

## 实施顺序

1. 视觉基础与首页 Hero。
2. Hero / 1602 Visual Twin 与建筑下钻。
3. Resident / Property 角色拆分。
4. Events、任务层与本地证据上传。
5. Case1602 章节锁定与 Group Constellation。
6. 响应式、无障碍、降级、性能、全量 QA 与部署。

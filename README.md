# 筑生：一栋房子一生的AI智能体

“筑生”是一套建筑全生命周期智能体交互样机。每栋建筑从项目启动时拥有唯一总智能体：建造期帮助工友形成可信的建筑生命记忆，入住后调用这些记忆、传感器和设备接口服务住户、物业与企业。

作品坚持“一套系统、四个视角、一条闭环”：

- `/`：建筑生命工作台，以BIM主画布呈现“一栋楼正在工作”。
- `/worker`：工友现场记录，区分原始口述、AI结构化和品质核验。
- `/resident`：住户事件处置，呈现传感趋势、证据引用与人工授权。
- `/group`：集团质量运行，呈现工单审计与跨项目知识反哺。
- 唯一完整样板：1602卫生间渗漏，从工友留痕到维修验证。

## 本地运行

需要 Node.js 20 或更高版本。Windows可双击：

```text
start-zhusheng.cmd
```

首次运行会安装依赖、生成静态页面和纯Worker生产版本，随后打开 `http://127.0.0.1:4173`。结束时双击 `stop-zhusheng.cmd`。

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

浏览器验收脚本为 `tests/visual-qa.mjs`，覆盖桌面、平板、390px手机、会话隔离与授权守卫。

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

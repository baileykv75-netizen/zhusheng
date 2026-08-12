# 1602卫生间数字样间

本目录是`ZS-DEMO-001 → LVL-16 → UNIT-1602 → SPACE-1602-BATHROOM`的展示层。空间尺寸、建筑坐标、语义构件和GlobalId均来自`bim/building-spec.json`及实际IFC。

> **全部画面均为脱敏合成演示模型，不作为施工依据。**

## 一键生成与验证

在仓库根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File bim/visual/build_bathroom_scene.ps1
```

脚本会定位Python 3.12和Blender 4.5，依次生成并验证IFC、建筑记忆、Blender场景、GLB、manifest和截图，随后运行全部pytest。也可传入安装路径：

```powershell
powershell -ExecutionPolicy Bypass -File bim/visual/build_bathroom_scene.ps1 `
  -BlenderPath "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" `
  -PythonPath "C:\Path\To\python.exe"
```

## 交付物

- `bathroom-1602.blend`：可编辑场景、灯光、相机、集合和材质；
- `bathroom-1602.glb`：嵌入全部必要资源的网页展示模型；
- `bathroom-1602-premium.blend`：从语义基线派生的展示级场景，不改变业务身份与状态节点；
- `bathroom-1602-premium.glb`：网页优先加载的增强模型；加载或完整性校验失败时自动回退至语义基线；
- `bathroom-1602-premium.validation.json`：增强模型的关键节点、体积、面数和细节预算报告；
- `bathroom-1602.manifest.json`：GLB节点与实际IFC身份、视图、状态及锚点映射；
- `bathroom-1602.validation.json`：重开BLEND和重导GLB后的机器验证报告；
- `screenshots/`：四张1600×900验收图；
- `phase2-identity-baseline.json`：阶段2既有745项身份回归基线。

## Blender查看

1. 使用Blender 4.5 LTS打开`bathroom-1602.blend`。
2. 在Outliner中切换`VIEW_RESIDENT`、`VIEW_DIAGNOSTIC`、`VIEW_CONSTRUCTION_MEMORY`和`VIEW_MAINTENANCE`集合。
3. 使用`CAM_RESIDENT_OVERVIEW`、`CAM_DIAGNOSTIC_CUTAWAY`、`CAM_JOINT_CLOSEUP`和`CAM_CONSTRUCTION_MEMORY`四个相机检查构图。
4. GLB独立检查可使用`File → Import → glTF 2.0`导入`bathroom-1602.glb`。

四个视图共用一套卫生间几何。居住视图隐藏系统和证据；诊断视图展示冷热水系统；施工记忆视图展示防水、闭水范围和锚点；维修视图只提供可调用的局部开口与修复状态，不表示事件已经发生。

## 可驱动状态

`DRY`、`DAMP_LIGHT`、`DAMP_MODERATE`、`DAMP_SEVERE`、`REPAIR_OPEN`和`REPAIRED`均为中立视觉状态，不构成诊断结论。阀门默认为`OPEN`；`CLOSED`仅改变手柄视觉角度，manifest明确标记`authorizationRequired=true`且视觉切换不授予授权。

六个证据锚点只记录相机可定位的位置和关联业务ID，不存放施工照片、读数或维修结论。

## 展示级派生模型

`scripts/build_bathroom_premium.py`只在受保护的`bathroom-1602.blend`基础上调整材质、灯光、曲面和平面收口，并增加不参与领域判断的展示细节。它不会替换IFC、建筑记忆、manifest、运行时变换或任何业务节点。

V6.5 还在 Premium 派生模型中加入排水与电气查询节点。这些节点全部标记为`SYNTHETIC_ENGINEERING_RECORD`，只用于建筑智能查询与空间高亮；其中 Cable/Device 组成`ELECTRICAL_POWER`功能拓扑，Conduit 只表示电缆的物理敷设与包含关系，不作为导电路径。语义基线GLB不变，网页运行时覆盖层是它的确定性回退。

```powershell
& "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" bim/visual/bathroom-1602.blend --background `
  --python bim/visual/scripts/build_bathroom_premium.py -- `
  --manifest bim/visual/bathroom-1602.manifest.json `
  --source-glb bim/visual/bathroom-1602.glb `
  --blend bim/visual/bathroom-1602-premium.blend `
  --glb bim/visual/bathroom-1602-premium.glb `
  --validation bim/visual/bathroom-1602-premium.validation.json `
  --screenshots bim/visual/screenshots/premium
```

生成后运行`pnpm run sync:life-event-assets`，同步脚本会同时校验原语义模型与增强模型的全部关键节点，并写入公开资产哈希清单。

## 资源与性能

场景仅使用程序化几何和Blender原生材质，没有外部贴图或本机绝对资源路径。语义基线验证器限制GLB不超过15 MB；展示级派生模型限制GLB不超过10 MB。两者总三角面均不超过150,000，并检查所有关键节点名称、IFC GlobalId、视图、状态和证据锚点。

本阶段不包含事件引擎、诊断评分、传感器时序、真实设备动作、工单、AI、Next.js或Three.js联动。

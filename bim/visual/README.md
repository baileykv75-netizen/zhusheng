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

## 资源与性能

场景仅使用程序化低多边形几何和Blender原生材质，没有外部贴图或本机绝对资源路径。验证器限制GLB不超过15 MB、总三角面不超过150,000，并检查所有关键节点名称、IFC GlobalId、视图、状态和证据锚点。

本阶段不包含事件引擎、诊断评分、传感器时序、真实设备动作、工单、AI、Next.js或Three.js联动。

# 筑生样板楼 BIM 阶段2.5

本目录使用Python与IfcOpenShell 0.8.5生成“筑生样板楼 ZS-DEMO-001”的IFC4空间骨架和低复杂度建筑实体壳体。

> **脱敏合成演示模型，不作为施工依据。**

阶段2.5在完整保留建筑壳体和阶段2构件链的基础上，增加五个卫生间环境构件，并从同一参数源生成可编辑Blender场景、轻量GLB、交互manifest和四张验收截图。不包含传感器时间序列、渗漏诊断、已授权动作、事件状态机、AI或网站联动。

## 环境

- Windows 10/11
- Python 3.12
- Blender 4.5 LTS与Bonsai 0.8.5（仅用于人工检查）

参数唯一事实源为`bim/building-spec.json`。

## 安装

在仓库根目录执行：

```powershell
python -m pip install -r bim/requirements.txt
```

## 生成

```powershell
python bim/scripts/generate_ifc.py
```

默认输出：

```text
bim/output/ZS-DEMO-001.ifc
```

也可以指定其他路径：

```powershell
python bim/scripts/generate_ifc.py --spec bim/building-spec.json --output C:\Temp\ZS-DEMO-001.ifc
```

脚本先写临时文件，再原子替换目标文件。若目标IFC正被其他程序锁定，生成会失败并保留原文件。

## 自动验证

```powershell
python bim/scripts/validate_ifc.py
```

验证器检查阶段1.1壳体数量、1602卫生间阶段2构件、空间归属、系统成员、端口占用、方向连接、冷水链连续性、上游阀门和人工授权边界。失败时返回非零退出码并列出具体对象。

## 建筑记忆与查询

生成与IFC一致的确定性记忆种子：

```powershell
python bim/scripts/generate_memory_seed.py
```

默认输出为`bim/data/building-memory.seed.json`。常用查询：

```powershell
python bim/scripts/query_building_memory.py component J-1602-CW-03 --json
python bim/scripts/query_building_memory.py upstream-valve J-1602-CW-03 --json
python bim/scripts/query_building_memory.py trace-space J-1602-CW-03 --json
python bim/scripts/query_building_memory.py related-evidence J-1602-CW-03 --json
```

不存在的业务ID会返回非零退出码。上游阀门通过连接图遍历得到，不使用接头ID特例。

## 测试

```powershell
python -m pytest bim/tests
```

测试覆盖空间层级、实体壳体、卫生间构件、系统拓扑、端口、建筑记忆、查询工具及全部业务对象GlobalId跨重复生成稳定性。

## 卫生间数字样间

一键重建IFC、记忆种子、`.blend`、`.glb`、manifest和截图，并重新导入GLB验证：

```powershell
powershell -ExecutionPolicy Bypass -File bim/visual/build_bathroom_scene.ps1
```

阶段2基线745个业务对象的身份快照保存在`bim/visual/phase2-identity-baseline.json`。阶段2.5新增五个环境构件后，测试会逐项对照旧GlobalId。视觉层使用真实卫生间建筑坐标，不复制业务真源。详细操作见`bim/visual/README.md`。

重复生成检查：

```powershell
python bim/scripts/generate_ifc.py
python bim/scripts/generate_ifc.py
python -m pytest bim/tests/test_stable_ids.py
```

## Bonsai人工检查

1. 启动Blender 4.5 LTS，确认已启用Bonsai 0.8.5。
2. 在Bonsai中选择`Open IFC Project`，打开`bim/output/ZS-DEMO-001.ifc`。
3. 检查空间树为项目、场地、建筑、18个楼层，并确认每层楼板可单独选择。
4. 检查南北立面的重复窗、首层南侧主入口、中央核心筒、屋面与女儿墙。
5. 隔离16层，确认四户、公共走廊和南北核心筒均存在；16层楼板和1602北立面定位窗使用差异化样式。
6. 展开`UNIT-1602`，确认六个内部空间，卫生间位于东北户靠核心筒一侧。
7. 单独选择卫生间五段墙、结构板和门，确认尺度、标高和几何正常。
8. 在对象属性中检查`Pset_ZhushengIdentity.BusinessId`。
9. 显示1602卫生间防水层、冷热水管、接头、阀门、水表和湿度传感器，检查可选择性与属性集。
10. 确认阀门`HumanAuthorizationRequired=true`且`AuthorizationState=NOT_REQUESTED`。

## 隐藏和显示空间

空间几何已写入高透明度IFC表面样式，默认不会完全遮住实体壳体。需要只看建筑构件时：

1. 在Bonsai的IFC搜索中将类别设为`IfcSpace`，执行选择。
2. 按`H`隐藏所有已选空间；按`Alt+H`恢复显示。
3. 也可以在Outliner中搜索`IfcSpace`，使用集合或对象右侧的眼睛图标切换可见性。

隐藏只影响Blender当前视图，不会删除IFC中的126个空间或改变空间层级。

## 快速定位1602

- 层级定位：在Bonsai空间树中依次展开`筑生样板楼A座`、`16层`、`1602户`、`1602卫生间`。
- 属性定位：在IFC搜索中选择属性集`Pset_ZhushengIdentity`、属性`BusinessId`，依次查询`LVL-16`、`UNIT-1602`或`SPACE-1602-BATHROOM`。
- 构件定位：隔离16层后，1602位于东北模块；其北立面两扇定位窗和16层楼板具有差异化样式，但身份确认仍以业务ID和空间树为准。

人工验收截图保存在`bim/output/screenshots/`。

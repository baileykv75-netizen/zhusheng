import type { LifeEventState } from "@/lib/life-event-engine/types";

export type BuildingEventDataClass = "DEMO_SYNTHETIC" | "REAL";
export type BuildingEventOwnerRole = "住户" | "物业值班" | "物业维修" | "集团质量";

export type BuildingLifeEventSummary = {
  id: string;
  title: string;
  floor: number;
  unitId: string;
  space: string;
  category: string;
  severity: "关注" | "一般" | "重要";
  displayStatus: string;
  technicalState?: string;
  ownerRole: BuildingEventOwnerRole;
  nextAction: string;
  updatedAt: string;
  evidenceCount: number;
  memoryReferenceCount: number;
  isDeepDemo: boolean;
  dataClass: BuildingEventDataClass;
};

const displayState: Record<LifeEventState, Pick<BuildingLifeEventSummary, "displayStatus" | "ownerRole" | "nextAction">> = {
  DETECTED: { displayStatus: "等待住户描述现场", ownerRole: "住户", nextAction: "描述实际现象并补充现场照片" },
  COLLECTING_EVIDENCE: { displayStatus: "现场事实补充中", ownerRole: "住户", nextAction: "按当前事实补充下一项必要证据" },
  INCONCLUSIVE: { displayStatus: "证据不足，暂不操作", ownerRole: "物业值班", nextAction: "核对缺口后决定由谁继续补证" },
  ASSESSED: { displayStatus: "已形成初步判断", ownerRole: "物业值班", nextAction: "查看候选、建筑记忆与证据边界" },
  ACTION_PROPOSED: { displayStatus: "等待物业提出处置", ownerRole: "物业值班", nextAction: "核对处置条件并发起必要申请" },
  AUTHORIZATION_PENDING: { displayStatus: "等待人工授权", ownerRole: "住户", nextAction: "确认是否允许当前受控操作" },
  AUTHORIZED: { displayStatus: "已授权，尚未执行", ownerRole: "物业值班", nextAction: "执行已授权的模拟设备动作" },
  SIMULATED_ACTION_APPLIED: { displayStatus: "正在隔离验证", ownerRole: "物业值班", nextAction: "记录动作后的新观察" },
  VERIFYING: { displayStatus: "正在隔离验证", ownerRole: "物业值班", nextAction: "提交动作后的新湿度与微流量观察" },
  ISOLATION_CONFIRMED: { displayStatus: "隔离结果已确认", ownerRole: "物业维修", nextAction: "根据已验证候选创建维修任务" },
  REPAIR_PENDING: { displayStatus: "等待维修", ownerRole: "物业维修", nextAction: "按当前维修任务检查目标构件" },
  REPAIR_RECORDED: { displayStatus: "维修已记录，等待恢复", ownerRole: "住户", nextAction: "完成独立恢复供水授权" },
  POST_REPAIR_VERIFYING: { displayStatus: "正在维修后复验", ownerRole: "物业值班", nextAction: "提交恢复供水后的新观察" },
  RESOLVED: { displayStatus: "已验证解决", ownerRole: "集团质量", nextAction: "审阅单事件经验" },
  REOPENED: { displayStatus: "维修后仍有异常", ownerRole: "物业值班", nextAction: "重新收集新一轮现场事实" }
};

export function buildingLifeEvents(state?: LifeEventState): BuildingLifeEventSummary[] {
  const current = state ? displayState[state] : displayState.DETECTED;
  return [
    {
      id: "EVT-1602",
      title: "1602卫生间持续潮湿",
      floor: 16,
      unitId: "1602",
      space: "主卫北侧墙",
      category: "给排水",
      severity: "重要",
      ...current,
      ...(state ? { technicalState: state } : {}),
      updatedAt: "刚刚",
      evidenceCount: state ? 6 : 0,
      memoryReferenceCount: 4,
      isDeepDemo: true,
      dataClass: "DEMO_SYNTHETIC"
    },
    {
      id: "EVT-1203",
      title: "1203窗边渗水",
      floor: 12,
      unitId: "1203",
      space: "次卧窗边",
      category: "外围护",
      severity: "一般",
      displayStatus: "等待补充现场信息",
      ownerRole: "住户",
      nextAction: "补拍雨后窗边照片",
      updatedAt: "18分钟前",
      evidenceCount: 1,
      memoryReferenceCount: 2,
      isDeepDemo: false,
      dataClass: "DEMO_SYNTHETIC"
    },
    {
      id: "EVT-1801",
      title: "1801水压异常",
      floor: 18,
      unitId: "1801",
      space: "厨房用水点",
      category: "给排水",
      severity: "关注",
      displayStatus: "等待人工授权",
      ownerRole: "住户",
      nextAction: "确认是否允许短时测试",
      updatedAt: "34分钟前",
      evidenceCount: 2,
      memoryReferenceCount: 1,
      isDeepDemo: false,
      dataClass: "DEMO_SYNTHETIC"
    },
    {
      id: "EVT-903",
      title: "903空调冷凝异常",
      floor: 9,
      unitId: "903",
      space: "客厅空调位",
      category: "暖通",
      severity: "关注",
      displayStatus: "已解决",
      ownerRole: "物业维修",
      nextAction: "无待办",
      updatedAt: "昨天",
      evidenceCount: 4,
      memoryReferenceCount: 2,
      isDeepDemo: false,
      dataClass: "DEMO_SYNTHETIC"
    },
    {
      id: "EVT-702",
      title: "702卫生间地漏异味",
      floor: 7,
      unitId: "702",
      space: "公卫地漏",
      category: "给排水",
      severity: "一般",
      displayStatus: "处理中",
      ownerRole: "物业维修",
      nextAction: "检查水封与通气条件",
      updatedAt: "2小时前",
      evidenceCount: 2,
      memoryReferenceCount: 1,
      isDeepDemo: false,
      dataClass: "DEMO_SYNTHETIC"
    }
  ];
}

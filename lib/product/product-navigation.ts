import type { ProductArea } from "./building-context";

export type ProductNavigationItem = {
  id: ProductArea;
  label: string;
  english: string;
  href?: string;
  available: boolean;
  children?: Array<{ href: string; label: string }>;
};

export const productNavigation: ProductNavigationItem[] = [
  { id: "OVERVIEW", label: "建筑总览", english: "BUILDING", href: "/", available: true },
  { id: "EVENTS", label: "生命事件", english: "EVENTS", href: "/events", available: true },
  { id: "MEMORY", label: "建筑记忆", english: "MEMORY", href: "/memory", available: true },
  {
    id: "COLLABORATION",
    label: "协同处理",
    english: "WORK",
    available: true,
    children: [
      { href: "/property", label: "物业运行" },
      { href: "/resident", label: "住户任务" },
      { href: "/worker", label: "施工记录" }
    ]
  },
  { id: "LEARNING", label: "经验治理", english: "LEARNING", href: "/group?mode=task", available: true }
];

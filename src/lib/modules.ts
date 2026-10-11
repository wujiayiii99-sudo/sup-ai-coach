/** 学习状态：与 module_progress.status 的三种取值一致 */
export type ModuleStatus = "not_started" | "in_progress" | "completed";

export interface ModuleInfo {
  no: number;
  name: string;
  navLabel: string;
  pageTitle: string;
  description: string;
  path: string;
}

/** 4 个模块的元数据，供首页卡片、导航、占位页共用 */
export const MODULES: ModuleInfo[] = [
  {
    no: 1,
    name: "模块 1 · 认识桨板",
    navLabel: "桨板器材",
    pageTitle: "桨板的基本构造与相关配件的功能介绍",
    description: "桨板装备、器材与选桨（图文 + 测验）",
    path: "/module/1",
  },
  {
    no: 2,
    name: "模块 2 · 基础划桨",
    navLabel: "技术视频",
    pageTitle: "桨板技术教学视频",
    description: "划行技术教学视频",
    path: "/module/2",
  },
  {
    no: 3,
    name: "模块 3 · 水上安全",
    navLabel: "安全知识",
    pageTitle: "桨板安全知识",
    description: "海洋环境安全与救援技术（图文 + 测验）",
    path: "/module/3",
  },
  {
    no: 4,
    name: "模块 4 · 直线划行 AI 评分",
    navLabel: "直线划行",
    pageTitle: "直线划行陪练",
    description: "摄像头实时姿态分析与评分",
    path: "/module/4",
  },
];

export const MODULE_STATUS_LABEL: Record<ModuleStatus, string> = {
  not_started: "未开始",
  in_progress: "学习中",
  completed: "已完成",
};

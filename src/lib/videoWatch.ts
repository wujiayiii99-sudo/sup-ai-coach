export interface TrackedVideo {
  bv: string;
  title: string;
  module_no: number;
}

export interface VideoWatchRecord {
  student_id: string;
  video_id: string;
}

/** 需要统计观看情况的视频：模块 2 三个 + 模块 3 一个 */
export const TRACKED_VIDEOS: TrackedVideo[] = [
  { bv: "BV1prp76mEjP", title: "桨板跪姿与站姿的直线划行技术", module_no: 2 },
  { bv: "BV1prp76mEMm", title: "桨板技术的陆上模拟训练方法", module_no: 2 },
  { bv: "BV1prp76mE87", title: "桨板转弯与绕标技术", module_no: 2 },
  { bv: "BV1prp76mEGt", title: "桨板落水后的上板技巧与平衡性练习", module_no: 3 },
];

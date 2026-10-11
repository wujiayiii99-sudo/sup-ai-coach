// 图片映射表：教材图号 -> 图片路径
// 规则：文件名 fig2-1-1.png -> 图2-1-1（fig 前缀替换为 图）；非 fig 前缀（如 img001）保留原名。
export const IMAGES: Record<string, string> = {
  "图2-1-1": "/images/raw/fig2-1-1.png",
  "图2-1-2": "/images/raw/fig2-1-2.png",
  "图2-1-3": "/images/raw/fig2-1-3.png",
  "图2-10": "/images/raw/fig2-10.png",
  "图2-11": "/images/raw/fig2-11.png",
  "图2-12": "/images/raw/fig2-12.png",
  "图2-13": "/images/raw/fig2-13.png",
  "图2-14": "/images/raw/fig2-14.png",
  "图2-15": "/images/raw/fig2-15.png",
  "图2-16": "/images/raw/fig2-16.png",
  "图2-17": "/images/raw/fig2-17.png",
  "图2-18": "/images/raw/fig2-18.png",
  "图2-19": "/images/raw/fig2-19.png",
  "图2-2-1": "/images/raw/fig2-2-1.png",
  "图2-2-2": "/images/raw/fig2-2-2.png",
  "图2-20": "/images/raw/fig2-20.png",
  "图2-21": "/images/raw/fig2-21.png",
  "图2-22": "/images/raw/fig2-22.png",
  "图2-23": "/images/raw/fig2-23.png",
  "图2-24": "/images/raw/fig2-24.png",
  "图2-25": "/images/raw/fig2-25.png",
  "图2-26": "/images/raw/fig2-26.png",
  "图2-27": "/images/raw/fig2-27.png",
  "图2-28": "/images/raw/fig2-28.png",
  "图2-29": "/images/raw/fig2-29.png",
  "图2-3-1": "/images/raw/fig2-3-1.png",
  "图2-3-2": "/images/raw/fig2-3-2.png",
  "图2-30": "/images/raw/fig2-30.png",
  "图2-31": "/images/raw/fig2-31.png",
  "图2-32": "/images/raw/fig2-32.png",
  "图2-33": "/images/raw/fig2-33.png",
  "图2-34-a": "/images/raw/fig2-34-a.png",
  "图2-34-b": "/images/raw/fig2-34-b.png",
  "图2-34-c": "/images/raw/fig2-34-c.png",
  "图2-35": "/images/raw/fig2-35.png",
  "图2-36": "/images/raw/fig2-36.png",
  "图2-37": "/images/raw/fig2-37.png",
  "图2-38": "/images/raw/fig2-38.png",
  "图2-39": "/images/raw/fig2-39.png",
  "图2-4-1": "/images/raw/fig2-4-1.png",
  "图2-4-2": "/images/raw/fig2-4-2.png",
  "图2-5-1": "/images/raw/fig2-5-1.png",
  "图2-5-2": "/images/raw/fig2-5-2.png",
  "图2-6": "/images/raw/fig2-6.png",
  "图2-7": "/images/raw/fig2-7.png",
  "图2-8": "/images/raw/fig2-8.png",
  "图2-9-1": "/images/raw/fig2-9-1.png",
  "图2-9-2": "/images/raw/fig2-9-2.png",
  "图3-1": "/images/raw/fig3-1.png",
  "图3-10": "/images/raw/fig3-10.png",
  "图3-11": "/images/raw/fig3-11.png",
  "图3-12": "/images/raw/fig3-12.png",
  "图3-13": "/images/raw/fig3-13.png",
  "图3-14": "/images/raw/fig3-14.png",
  "图3-15": "/images/raw/fig3-15.png",
  "图3-16-1": "/images/raw/fig3-16-1.png",
  "图3-16-2": "/images/raw/fig3-16-2.png",
  "图3-17": "/images/raw/fig3-17.png",
  "图3-18-1": "/images/raw/fig3-18-1.png",
  "图3-18-2": "/images/raw/fig3-18-2.png",
  "图3-19": "/images/raw/fig3-19.png",
  "图3-2": "/images/raw/fig3-2.png",
  "图3-20-1": "/images/raw/fig3-20-1.png",
  "图3-20-2": "/images/raw/fig3-20-2.png",
  "图3-21-1": "/images/raw/fig3-21-1.png",
  "图3-21-2": "/images/raw/fig3-21-2.png",
  "图3-21-3": "/images/raw/fig3-21-3.png",
  "图3-22": "/images/raw/fig3-22.png",
  "图3-23": "/images/raw/fig3-23.png",
  "图3-24": "/images/raw/fig3-24.png",
  "图3-3": "/images/raw/fig3-3.png",
  "图3-4": "/images/raw/fig3-4.png",
  "图3-5": "/images/raw/fig3-5.png",
  "图3-6": "/images/raw/fig3-6.png",
  "图3-7": "/images/raw/fig3-7.png",
  "图3-8": "/images/raw/fig3-8.png",
  "图3-9": "/images/raw/fig3-9.png",
  "图5-1-1": "/images/raw/fig5-1-1.png",
  "图5-1-2": "/images/raw/fig5-1-2.png",
  "图5-1-3": "/images/raw/fig5-1-3.png",
  "图5-1-4": "/images/raw/fig5-1-4.png",
  "图5-1-5": "/images/raw/fig5-1-5.png",
  "图5-1-6": "/images/raw/fig5-1-6.png",
  "图5-1-7": "/images/raw/fig5-1-7.png",
  "图5-1-8": "/images/raw/fig5-1-8.png",
  "图5-2": "/images/raw/fig5-2.png",
  "img001": "/images/raw/img001.png",
};

/**
 * 按图号取图：精确命中返回一张；否则返回所有以「图号-」开头的子图（按 key 排序）。
 * 例：imagesFor("图2-1") -> [图2-1-1, 图2-1-2, 图2-1-3]；imagesFor("图5-1") -> 8 张。
 * 只匹配「图号-」前缀，避免「图2-1」误匹配「图2-10」。
 */
export function imagesFor(figNo: string): string[] {
  if (IMAGES[figNo]) return [IMAGES[figNo]];
  return Object.keys(IMAGES)
    .filter((k) => k.startsWith(`${figNo}-`))
    .sort()
    .map((k) => IMAGES[k]);
}

/** 快捷构造：图号 -> 图片数组（共用同一题注） */
export function figure(figNo: string, caption: string): { src: string; caption: string }[] {
  return imagesFor(figNo).map((src) => ({ src, caption }));
}

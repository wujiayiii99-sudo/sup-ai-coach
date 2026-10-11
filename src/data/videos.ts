export interface Video {
  id: number;
  title: string;
  bv: string;
  iframe: string;
  usage: string;
}

/** 5 个教学视频（来自 content/视频清单.md） */
export const VIDEOS: Video[] = [
  {
    id: 1,
    title: "桨板运动器材与配件",
    bv: "BV1prp76mEhP",
    iframe:
      '<iframe src="https://player.bilibili.com/player.html?isOutside=true&aid=117420278679267&bvid=BV1prp76mEhP&cid=42642706177&p=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>',
    usage: "模块 1 开篇或结尾",
  },
  {
    id: 2,
    title: "桨板落水后的上板技巧与平衡性练习",
    bv: "BV1prp76mEGt",
    iframe:
      '<iframe src="https://player.bilibili.com/player.html?isOutside=true&aid=117420278680288&bvid=BV1prp76mEGt&cid=42642769493&p=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>',
    usage: "模块 3「安全落水与重新上板」",
  },
  {
    id: 3,
    title: "桨板跪姿与站姿的直线划行技术",
    bv: "BV1prp76mEjP",
    iframe:
      '<iframe src="https://player.bilibili.com/player.html?isOutside=true&aid=117420278680535&bvid=BV1prp76mEjP&cid=42642833870&p=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>',
    usage: "模块 2 和模块 4（陪练的理论部分）",
  },
  {
    id: 4,
    title: "桨板转弯与绕标技术",
    bv: "BV1prp76mE87",
    iframe:
      '<iframe src="https://player.bilibili.com/player.html?isOutside=true&aid=117420278679248&bvid=BV1prp76mE87&cid=42642837157&p=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>',
    usage: "模块 2",
  },
  {
    id: 5,
    title: "桨板技术的陆上模拟训练方法",
    bv: "BV1prp76mEMm",
    iframe:
      '<iframe src="https://player.bilibili.com/player.html?isOutside=true&aid=117420278679997&bvid=BV1prp76mEMm&cid=42642902067&p=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>',
    usage: "模块 2",
  },
];

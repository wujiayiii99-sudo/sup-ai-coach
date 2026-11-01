/** 答疑园地：帖子分类（与 forum_posts.category 取值一致） */
export const FORUM_CATEGORIES = [
  "器材装备",
  "安全知识",
  "技术划行",
  "其他",
] as const;

export type ForumCategory = (typeof FORUM_CATEGORIES)[number];

/** forum_posts 表 + 关联的 students 行 */
export interface ForumPost {
  id: string;
  student_id: string;
  title: string;
  content: string;
  category: string;
  created_at: string;
  students?: {
    name: string;
    class_name: string | null;
  } | null;
}

/** forum_replies 表 + 关联的 students 行 */
export interface ForumReply {
  id: string;
  post_id: string;
  student_id: string;
  content: string;
  created_at: string;
  students?: {
    name: string;
    class_name: string | null;
  } | null;
}

/** 帖子作者显示名：姓名（班级） */
export function forumAuthorLabel(
  author: { name: string; class_name: string | null } | null | undefined
): string {
  if (!author) return "未知";
  return author.class_name
    ? `${author.name}（${author.class_name}）`
    : author.name;
}

const CATEGORY_SLUG: Record<string, string> = {
  器材装备: "equipment",
  安全知识: "safety",
  技术划行: "technique",
  其他: "other",
};

/** 分类 → 稳定的 ASCII class 后缀，用于着色 */
export function forumCategoryClass(category: string): string {
  return CATEGORY_SLUG[category] ?? "other";
}

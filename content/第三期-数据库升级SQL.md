# 第三期升级 · 数据库 SQL（需手动执行一次）

> 本文件包含「社区互动与班级管理」所需的全部数据库变更。
> 请到 Supabase 控制台 → **SQL Editor** → 新建查询，粘贴下面整段 SQL 后点 **Run**。
> 所有语句均做了幂等处理（`if not exists`），可安全重复执行。

```sql
-- ============================================================
-- 第三期：社区互动与班级管理
-- ============================================================

-- 1) students 表新增「班级」字段
alter table public.students
  add column if not exists class_name text;

-- 2) 答疑园地 · 帖子表
create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  title text not null,
  content text not null,
  category text not null,
  created_at timestamptz not null default now()
);

-- 3) 答疑园地 · 回复表
create table if not exists public.forum_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.forum_posts(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- 4) 开启 RLS，并允许 anon 角色读写（与现有表策略一致）
alter table public.forum_posts enable row level security;
alter table public.forum_replies enable row level security;

create policy "forum_posts anon all"
  on public.forum_posts
  for all
  to anon
  using (true)
  with check (true);

create policy "forum_replies anon all"
  on public.forum_replies
  for all
  to anon
  using (true)
  with check (true);
```

## 说明

- `forum_posts.student_id` 与 `forum_replies.student_id` 都建了外键指向 `students(id)`，
  这样前端才能用 `select("*, students(name, class_name)")` 一次性带出发帖/回复人的姓名和班级。
- `class_name` 允许为空；历史学生首次重新登录时会被要求补填班级。
- 表结构与现有 5 张表风格一致（uuid 主键 + `gen_random_uuid()` + `timestamptz` + `now()`）。

# 第二阶段 · 数据库 SQL（需手动执行一次）

> 本阶段只需新增一张「视频观看记录」表，用于学情报告统计视频学习情况。
> 请到 Supabase 控制台 → **SQL Editor** → 新建查询，粘贴下面 SQL 后点 **Run**。

```sql
-- 视频观看记录表（模块 2/3 视频下方「我已认真看完」按钮写入）
create table if not exists public.video_watches (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  video_id text not null,
  created_at timestamptz not null default now(),
  unique (student_id, video_id)
);

-- RLS：允许 anon 读写（与现有表策略一致）
alter table public.video_watches enable row level security;

create policy "video_watches anon all"
  on public.video_watches
  for all
  to anon
  using (true)
  with check (true);
```

## 说明

- `video_id` 存视频的 B 站 BV 号（如 `BV1prp76mEjP`），稳定唯一，用于前端 upsert 与报告统计。
- `unique (student_id, video_id)` 保证同一学生同一视频只记一条，重复点击不会重复计数。
- 前端用 `upsert(..., { onConflict: "student_id,video_id" })` 幂等写入。
- 本阶段不需要改动其它表；题目正确率分析直接读现有 `quiz_scores.answers` (jsonb) 字段。

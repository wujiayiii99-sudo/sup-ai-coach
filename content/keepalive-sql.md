# keepalive 保活表建表 SQL

用于配合 GitHub Actions 定时保活（`.github/workflows/keepalive.yml`），防止 Supabase 免费版项目因超过 7 天不活跃被自动暂停。

在 Supabase 控制台的 **SQL Editor** 中新建一个查询，粘贴以下 SQL 后点击 Run：

```sql
-- 1. 创建 keepalive 表
create table if not exists public.keepalive (
  id uuid primary key default gen_random_uuid(),
  value text not null,
  created_at timestamptz not null default now()
);

-- 2. 开启 Row Level Security
alter table public.keepalive enable row level security;

-- 3. 允许 anon 角色 insert（保活仅需写入一条数据）
create policy "anon can insert keepalive"
  on public.keepalive
  for insert
  to anon
  with check (true);
```

## 说明

- 该表为新增表，不影响现有业务表和结构。
- 仅开放 `insert` 权限给 anon 角色，符合保活场景的最小权限原则；anon 无法读取或删除该表数据。
- GitHub Actions 每次保活会往表中插入一条 `{"value":"ping"}` 记录，数据会随时间累积。如需要，可在 Supabase 中手动清空该表，或日后自行补充清理逻辑（本次未包含，避免改动业务代码）。

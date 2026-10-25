-- 4단계: 학습지 저장 — Supabase SQL Editor에서 한 번 실행하세요.
create table if not exists worksheets (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  problem_ids uuid[] not null default '{}',      -- 담은 순서 그대로
  options     jsonb not null default '{}',       -- {answers: none|key|solutions, showSource: bool}
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table worksheets enable row level security;
drop policy if exists "auth_all" on worksheets;
create policy "auth_all" on worksheets for all to authenticated using (true) with check (true);

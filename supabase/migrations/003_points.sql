-- 배점 필터용: 문항 배점 칸 추가 — Supabase SQL Editor에서 한 번 실행하세요.
alter table problems add column if not exists points smallint;  -- 2, 3, 4 … (배점 표기가 없으면 비움)
create index if not exists problems_points_idx on problems(points);

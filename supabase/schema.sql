-- 모의고사 문항 DB — Supabase SQL Editor에 그대로 붙여넣어 실행
-- 실행 후 seed.sql(체계표 초기값)도 실행하세요.

-- ───────── 체계표 ─────────
create table if not exists units (
  key  text primary key,            -- 교육과정 연결 키 (TRIG, DIFF …)
  name text not null,
  sort int  not null default 0
);

create table if not exists sections (
  id       bigint generated always as identity primary key,
  unit_key text not null references units(key) on update cascade,
  key      text not null,
  name     text not null,
  sort     int  not null default 0,
  verify   text,                    -- '확인 필요' 메모
  unique (unit_key, key)
);

create table if not exists tags (
  id         bigint generated always as identity primary key,
  section_id bigint not null references sections(id) on delete cascade,
  name       text not null,
  sort       int  not null default 0,
  created_at timestamptz not null default now(),
  unique (section_id, name)
);

create table if not exists subjects (
  id         text primary key,      -- 2015-math1, 2022-algebra …
  curriculum text not null,         -- 2015 / 2022 / common
  name       text not null,
  unit_keys  text[] not null,
  sort       int not null default 0
);

-- ───────── 회차·문항 ─────────
create table if not exists exams (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,                       -- 예: PinPoint Light 2회
  curriculum        text not null check (curriculum in ('2015','2022')),
  source_raw        text,
  header_title_text text,
  problem_style_id  text,
  section_head      text not null,                       -- HWPX 재출력용 원본 조각
  section_tail      text not null,
  shell_runs_xml    text not null,
  column_width      int,
  bin_data          jsonb not null default '{}',
  image_files       jsonb not null default '{}',         -- binId → {file, mime} (Storage 경로)
  file_path         text not null,                       -- Storage: exams/<id>/original.hwpx
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now()
);

create table if not exists problems (
  id              uuid primary key default gen_random_uuid(),
  exam_id         uuid not null references exams(id) on delete cascade,
  number          int  not null,
  answer          text,
  main_unit       text references units(key) on update cascade,
  tag_status      text not null default 'draft' check (tag_status in ('draft','confirmed')),
  problem_xml     text not null,
  problem_xml_sol text not null,
  solution_xml    text,
  problem_blocks  jsonb not null,
  solution_blocks jsonb not null,
  images          text[] not null default '{}',
  solution_images text[] not null default '{}',
  points          smallint,                            -- 배점 (2, 3, 4 …)
  created_at      timestamptz not null default now(),
  unique (exam_id, number)
);
create index if not exists problems_main_unit_idx on problems(main_unit);

create table if not exists problem_tags (
  problem_id uuid   not null references problems(id) on delete cascade,
  tag_id     bigint not null references tags(id) on delete cascade,
  primary key (problem_id, tag_id)
);
create index if not exists problem_tags_tag_idx on problem_tags(tag_id);


-- ───────── 학습지 (4단계) ─────────
create table if not exists worksheets (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  problem_ids uuid[] not null default '{}',
  options     jsonb not null default '{}',
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ───────── 권한: 로그인한 사용자만 ─────────
-- (Authentication → Sign In / Providers 에서 'Allow new users to sign up'을 꺼 두세요.
--  그러면 대장님이 직접 만든 계정만 로그인할 수 있습니다.)
alter table units        enable row level security;
alter table sections     enable row level security;
alter table tags         enable row level security;
alter table subjects     enable row level security;
alter table exams        enable row level security;
alter table problems     enable row level security;
alter table problem_tags enable row level security;
alter table worksheets   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['units','sections','tags','subjects','exams','problems','problem_tags','worksheets'] loop
    execute format('drop policy if exists "auth_all" on %I', t);
    execute format('create policy "auth_all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ───────── 파일 저장소 (비공개) ─────────
insert into storage.buckets (id, name, public)
values ('exams', 'exams', false)
on conflict (id) do nothing;

drop policy if exists "exams_auth_select" on storage.objects;
drop policy if exists "exams_auth_insert" on storage.objects;
drop policy if exists "exams_auth_update" on storage.objects;
create policy "exams_auth_select" on storage.objects for select to authenticated using (bucket_id = 'exams');
create policy "exams_auth_insert" on storage.objects for insert to authenticated with check (bucket_id = 'exams');
create policy "exams_auth_update" on storage.objects for update to authenticated using (bucket_id = 'exams');

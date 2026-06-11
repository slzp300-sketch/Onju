-- 온주(Onju) 초기 스키마 + RLS
-- 적용: Supabase 대시보드 SQL Editor에서 실행 (또는 supabase db push)

-- ============================================================
-- 프로필 (auth.users 1:1, 가입 시 트리거로 자동 생성)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text,
  profile_image text,
  weekly_goal_slots int not null default 3,
  goal_slots int not null default 3,
  onboarding_done boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 개인 데이터 테이블
-- ============================================================
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}',
  streak jsonb not null default '{}',
  notifications jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.monthly_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  description text,
  month int not null,
  year int not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'active',
  to_be_statement text,
  goal_routines jsonb,
  color text,
  category text,
  created_at timestamptz not null default now()
);

create table public.weekly_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  monthly_goal_id uuid,
  title text not null,
  week_number int not null,
  year int not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'active',
  completion_rate int not null default 0,
  linked_routine_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.daily_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  emoji text,
  type text not null check (type in ('personal', 'faith')),
  weekly_goal_id uuid,
  monthly_goal_id uuid,
  frequency jsonb not null default '"daily"',
  is_active boolean not null default true,
  sort_order int not null default 0,
  duration_minutes int,
  duration_seconds int,
  time_slot text,
  when_text text,
  two_minute_habit text,
  notification jsonb,
  goal_id uuid,
  created_at timestamptz not null default now()
);

create table public.routine_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid not null,
  date date not null,
  completed boolean not null default false,
  skipped boolean not null default false,
  memo text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, routine_id, date)
);
create index routine_logs_user_date_idx on public.routine_logs (user_id, date);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  emoji text not null default '',
  frequency text not null default 'daily',
  custom_days int[],
  when_text text not null default '',
  goal_id uuid,
  duration_seconds int,
  mini_routine text,
  two_minute_habit text,
  notification jsonb,
  created_at timestamptz not null default now()
);

create table public.habit_logs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id uuid not null,
  date date not null,
  completed boolean not null default false,
  skipped boolean not null default false,
  substitute boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, habit_id, date)
);
create index habit_logs_user_date_idx on public.habit_logs (user_id, date);

create table public.personal_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  emoji text not null default '',
  when_text text not null default '',
  habit_ids text[] not null default '{}',
  habit_durations jsonb,
  timer_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  emoji text,
  date date not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.diary_entries (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  mood text,
  content text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_number int not null,
  year int not null,
  personal_rate int not null default 0,
  faith_rate int not null default 0,
  goal_achieved_count int not null default 0,
  goal_total_count int not null default 0,
  mood text,
  goal_ratings jsonb not null default '{}',
  comment text not null default '',
  intention text not null default '',
  share_to_groups text[] not null default '{}',
  routine_changes jsonb not null default '[]',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, week_number, year)
);

-- ============================================================
-- 소모임 (다중 사용자)
-- ============================================================
create table public.small_groups (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  goal text not null default '',
  start_date date not null,
  end_date date not null,
  max_members int not null default 10,
  status text not null default 'recruiting',
  is_public boolean not null default true,
  category text,
  cover_icon text,
  color text,
  rules text[],
  created_at timestamptz not null default now()
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.small_groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('creator', 'member')),
  joined_at timestamptz not null default now(),
  shared_goal_ids text[] not null default '{}',
  shared_routine_ids text[] not null default '{}',
  unique (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.group_weekly_shares (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.small_groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_number int not null,
  year int not null,
  personal_rate int not null default 0,
  faith_rate int not null default 0,
  comment text not null default '',
  intention text not null default '',
  shared_at timestamptz not null default now()
);
create index group_weekly_shares_group_idx on public.group_weekly_shares (group_id, year, week_number);

create table public.cheers (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  share_id uuid not null references public.group_weekly_shares(id) on delete cascade,
  group_id uuid not null references public.small_groups(id) on delete cascade,
  type text not null check (type in ('heart', 'fire', 'pray')),
  date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (from_user_id, share_id, type)
);

-- ============================================================
-- RLS 헬퍼
-- ============================================================
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

-- ============================================================
-- RLS 정책
-- ============================================================
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.monthly_goals enable row level security;
alter table public.weekly_goals enable row level security;
alter table public.daily_routines enable row level security;
alter table public.routine_logs enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.personal_routines enable row level security;
alter table public.todos enable row level security;
alter table public.diary_entries enable row level security;
alter table public.weekly_reviews enable row level security;
alter table public.small_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_weekly_shares enable row level security;
alter table public.cheers enable row level security;

-- profiles: 그룹 화면에서 타인 이름이 필요하므로 인증 사용자 전체 조회 허용
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_insert" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles_update" on public.profiles
  for update to authenticated using (id = auth.uid());

-- 개인 테이블: 본인 행만
create policy "own_rows" on public.user_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own_rows" on public.monthly_goals
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own_rows" on public.weekly_goals
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own_rows" on public.daily_routines
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own_rows" on public.routine_logs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own_rows" on public.habits
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own_rows" on public.habit_logs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own_rows" on public.personal_routines
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own_rows" on public.todos
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own_rows" on public.diary_entries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own_rows" on public.weekly_reviews
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- small_groups: 공개 그룹은 누구나, 비공개는 생성자/멤버만 조회
create policy "groups_select" on public.small_groups
  for select to authenticated
  using (is_public or creator_id = auth.uid() or public.is_group_member(id));
create policy "groups_insert" on public.small_groups
  for insert to authenticated with check (creator_id = auth.uid());
create policy "groups_update" on public.small_groups
  for update to authenticated using (creator_id = auth.uid());
create policy "groups_delete" on public.small_groups
  for delete to authenticated using (creator_id = auth.uid());

-- group_members: 멤버/공개그룹 조회, 본인 행만 생성·삭제 (정원 체크는 join_group RPC)
create policy "members_select" on public.group_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_group_member(group_id)
    or exists (select 1 from public.small_groups g where g.id = group_id and g.is_public)
  );
create policy "members_insert" on public.group_members
  for insert to authenticated with check (user_id = auth.uid());
create policy "members_update" on public.group_members
  for update to authenticated using (user_id = auth.uid());
create policy "members_delete" on public.group_members
  for delete to authenticated using (user_id = auth.uid());

-- group_weekly_shares / cheers: 멤버만 조회, 본인 것만 쓰기
create policy "shares_select" on public.group_weekly_shares
  for select to authenticated using (public.is_group_member(group_id));
create policy "shares_insert" on public.group_weekly_shares
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_group_member(group_id));
create policy "shares_update" on public.group_weekly_shares
  for update to authenticated using (user_id = auth.uid());

create policy "cheers_select" on public.cheers
  for select to authenticated using (public.is_group_member(group_id));
create policy "cheers_insert" on public.cheers
  for insert to authenticated
  with check (from_user_id = auth.uid() and public.is_group_member(group_id));
create policy "cheers_delete" on public.cheers
  for delete to authenticated using (from_user_id = auth.uid());

-- ============================================================
-- RPC: 그룹 가입 (정원 체크 원자적 처리 — 클라이언트 카운트 불신)
-- ============================================================
create or replace function public.join_group(gid uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  cap int;
  cnt int;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요';
  end if;

  select max_members into cap from small_groups where id = gid for update;
  if cap is null then
    raise exception '존재하지 않는 소모임이에요';
  end if;

  if exists (select 1 from group_members where group_id = gid and user_id = auth.uid()) then
    return; -- 이미 멤버
  end if;

  select count(*) into cnt from group_members where group_id = gid;
  if cnt >= cap then
    raise exception '정원이 가득 찼어요';
  end if;

  insert into group_members (group_id, user_id, role) values (gid, auth.uid(), 'member');
end;
$$;

-- ============================================================
-- 예정일 판정 (src/utils/goalProgress.ts isScheduled 포팅)
-- freq: '"daily"' | '"weekdays"' | '"weekends"' | '"custom"' | [0..6 int 배열]
-- dow: 0=일 .. 6=토 (JS getDay와 동일)
-- ============================================================
create or replace function public.is_scheduled(freq jsonb, custom_days int[], d date)
returns boolean
language sql
immutable
as $$
  select case
    when freq = '"daily"'::jsonb then true
    when freq = '"weekdays"'::jsonb then extract(dow from d)::int between 1 and 5
    when freq = '"weekends"'::jsonb then extract(dow from d)::int in (0, 6)
    when freq = '"custom"'::jsonb then extract(dow from d)::int = any (coalesce(custom_days, '{}'))
    when jsonb_typeof(freq) = 'array' then
      exists (select 1 from jsonb_array_elements_text(freq) e
              where e::int = extract(dow from d)::int)
    else true
  end;
$$;

-- ============================================================
-- RPC: 그룹 멤버 진행도 (타인 로그를 RLS로 열지 않고 집계만 노출)
-- 정의(단순화, 로컬 통계와 소폭 오차 허용):
--  - 오늘 개인율: 오늘 예정된 habits 중 완료·대체·쉬어가기 비율
--  - 오늘 신앙율: 오늘 예정된 faith daily_routines 중 완료·쉬어가기 비율
--  - 주간율: 이번 주(월요일 시작)~오늘 통합 달성률
--  - 스트릭: 오늘부터 거꾸로, 통합 달성률 50% 이상 연속 일수 (예정 없는 날은 건너뜀, 최대 180일)
-- ============================================================
create or replace function public.get_group_member_progress(gid uuid)
returns table (
  user_id uuid,
  user_name text,
  profile_image text,
  today_personal_rate int,
  today_faith_rate int,
  weekly_rate int,
  streak int
)
language plpgsql
security definer set search_path = public
stable
as $$
declare
  m record;
  today date := current_date;
  week_start date := date_trunc('week', current_date)::date; -- 월요일
  d date;
  total int;
  done int;
  wk_total int;
  wk_done int;
  st int;
  st_broken boolean;
begin
  if not public.is_group_member(gid) then
    raise exception '소모임 멤버만 볼 수 있어요';
  end if;

  for m in
    select gm.user_id as uid, p.name, p.profile_image as img
    from group_members gm
    join profiles p on p.id = gm.user_id
    where gm.group_id = gid
  loop
    user_id := m.uid;
    user_name := m.name;
    profile_image := m.img;

    -- 오늘 개인(habits)율
    select count(*) into total from habits h
      where h.user_id = m.uid and public.is_scheduled(to_jsonb(h.frequency), h.custom_days, today);
    select count(*) into done from habits h
      join habit_logs l on l.habit_id = h.id and l.user_id = m.uid and l.date = today
      where h.user_id = m.uid and public.is_scheduled(to_jsonb(h.frequency), h.custom_days, today)
        and (l.completed or l.skipped or l.substitute);
    today_personal_rate := case when total = 0 then 0 else round(done * 100.0 / total) end;

    -- 오늘 신앙(faith routines)율
    select count(*) into total from daily_routines r
      where r.user_id = m.uid and r.type = 'faith' and r.is_active
        and public.is_scheduled(r.frequency, null, today);
    select count(*) into done from daily_routines r
      join routine_logs l on l.routine_id = r.id and l.user_id = m.uid and l.date = today
      where r.user_id = m.uid and r.type = 'faith' and r.is_active
        and public.is_scheduled(r.frequency, null, today)
        and (l.completed or l.skipped);
    today_faith_rate := case when total = 0 then 0 else round(done * 100.0 / total) end;

    -- 주간 통합율 + 스트릭 (일자별 통합 done/total 집계 후 계산)
    wk_total := 0; wk_done := 0; st := 0; st_broken := false;
    for d, total, done in
      with days as (
        select gs::date as day from generate_series(today - 179, today, interval '1 day') gs
      ),
      sched as (
        select dd.day, h.id::text as item_id,
          exists (
            select 1 from habit_logs l
            where l.user_id = m.uid and l.habit_id = h.id and l.date = dd.day
              and (l.completed or l.skipped or l.substitute)
          ) as is_done
        from days dd
        cross join habits h
        where h.user_id = m.uid
          and public.is_scheduled(to_jsonb(h.frequency), h.custom_days, dd.day)
          and h.created_at::date <= dd.day
        union all
        select dd.day, r.id::text,
          exists (
            select 1 from routine_logs l
            where l.user_id = m.uid and l.routine_id = r.id and l.date = dd.day
              and (l.completed or l.skipped)
          )
        from days dd
        cross join daily_routines r
        where r.user_id = m.uid and r.type = 'faith' and r.is_active
          and public.is_scheduled(r.frequency, null, dd.day)
          and r.created_at::date <= dd.day
      )
      select s.day, count(*)::int, count(*) filter (where s.is_done)::int
      from sched s group by s.day order by s.day desc
    loop
      if d >= week_start then
        wk_total := wk_total + total;
        wk_done := wk_done + done;
      end if;
      -- 스트릭: 가장 최근 날부터, 50% 미만이면 중단 (예정 없는 날은 집계에 안 나옴 = 건너뜀)
      if not st_broken then
        if total > 0 and done * 100.0 / total >= 50 then
          st := st + 1;
        else
          st_broken := true; -- 이후로는 주간 집계만 수행
        end if;
      end if;
    end loop;

    weekly_rate := case when wk_total = 0 then 0 else round(wk_done * 100.0 / wk_total) end;
    streak := st;

    return next;
  end loop;
end;
$$;

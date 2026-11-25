-- 온주 Web MVP의 실행 항목과 일일 점검을 대화 세션 JSON에서 분리한다.
-- 익명 MVP 세션을 소유권 경계로 사용하며, 클라이언트 직접 접근은 허용하지 않는다.

create table public.web_mvp_routine_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.web_mvp_agent_sessions(session_id) on delete cascade,
  source_plan_item_id text not null,
  day_index smallint not null check (day_index between 0 and 6),
  title text not null check (char_length(title) between 1 and 160),
  minimum_action text not null default '',
  start_time time,
  end_time time,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, source_plan_item_id)
);

create index web_mvp_routine_items_session_day_idx
  on public.web_mvp_routine_items (session_id, day_index)
  where active;

create table public.web_mvp_daily_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.web_mvp_agent_sessions(session_id) on delete cascade,
  log_date date not null,
  timezone text not null default 'Asia/Seoul' check (timezone = 'Asia/Seoul'),
  energy smallint check (energy between 1 and 5),
  blocker text not null default '',
  adjustment text not null default '',
  summary text not null default '',
  first_recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, log_date)
);

create index web_mvp_daily_logs_session_date_idx
  on public.web_mvp_daily_logs (session_id, log_date desc);

create table public.web_mvp_item_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.web_mvp_agent_sessions(session_id) on delete cascade,
  daily_log_id uuid not null references public.web_mvp_daily_logs(id) on delete cascade,
  routine_item_id uuid not null references public.web_mvp_routine_items(id) on delete cascade,
  log_date date not null,
  status text not null check (status in ('completed', 'missed', 'exception')),
  note text not null default '',
  evidence_text text not null default '',
  source text not null default 'checkin' check (source in ('checkin', 'quick_action')),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, routine_item_id, log_date)
);

create index web_mvp_item_logs_session_date_idx
  on public.web_mvp_item_logs (session_id, log_date desc);

create table public.web_mvp_checkin_preferences (
  session_id uuid primary key references public.web_mvp_agent_sessions(session_id) on delete cascade,
  timezone text not null default 'Asia/Seoul' check (timezone = 'Asia/Seoul'),
  morning_enabled boolean not null default true,
  morning_time time not null default '06:30',
  closing_enabled boolean not null default true,
  closing_time time not null default '22:00',
  updated_at timestamptz not null default now()
);

create table public.web_mvp_checkin_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.web_mvp_agent_sessions(session_id) on delete cascade,
  check_date date not null,
  check_type text not null check (check_type in ('morning', 'closing')),
  status text not null default 'active' check (status in ('active', 'completed')),
  step smallint not null default 0 check (step between 0 and 3),
  collected jsonb not null default '{}'::jsonb check (jsonb_typeof(collected) = 'object'),
  pending_question text not null default '',
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (session_id, check_date, check_type)
);

create index web_mvp_checkin_sessions_session_date_idx
  on public.web_mvp_checkin_sessions (session_id, check_date desc);

alter table public.web_mvp_routine_items enable row level security;
alter table public.web_mvp_daily_logs enable row level security;
alter table public.web_mvp_item_logs enable row level security;
alter table public.web_mvp_checkin_preferences enable row level security;
alter table public.web_mvp_checkin_sessions enable row level security;

comment on table public.web_mvp_routine_items is '확정 주간 계획에서 동기화한 온주 Web MVP 실행 항목.';
comment on table public.web_mvp_daily_logs is '한국시간 날짜별 컨디션·방해 요인·조정 기록.';
comment on table public.web_mvp_item_logs is '실행 항목별 완료·미실행·사전 예외 기록.';
comment on table public.web_mvp_checkin_sessions is '아침·마감 점검의 서버 주도 진행 상태.';

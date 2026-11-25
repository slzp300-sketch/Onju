-- 반복 실패를 의지 문제가 아닌 선행조건과 구조 실험으로 다룬다.
-- 사용자가 승인한 14일 실험만 저장하며, 기존 계획을 자동 변경하지 않는다.

alter table public.web_mvp_routine_items
  add column dependency_kinds text[] not null default '{}'::text[],
  add column active_strategy text not null default '',
  add column strategy_trial_until date;

alter table public.web_mvp_routine_items
  add constraint web_mvp_routine_items_dependency_kinds_valid
  check (
    dependency_kinds <@ array['wake', 'sleep', 'schedule', 'energy']::text[]
    and cardinality(dependency_kinds) <= 3
  );

create table public.web_mvp_rule_trials (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.web_mvp_agent_sessions(session_id) on delete cascade,
  routine_key text not null check (char_length(routine_key) between 1 and 180),
  signal_type text not null check (signal_type in ('missed_streak', 'low_adherence')),
  dependency_kind text not null check (dependency_kind in ('wake', 'sleep', 'schedule', 'energy')),
  strategy_id text not null check (char_length(strategy_id) between 1 and 80),
  strategy text not null check (char_length(strategy) between 1 and 240),
  rationale text not null default '',
  started_on date not null,
  trial_until date not null check (trial_until >= started_on),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  verdict text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index web_mvp_rule_trials_one_active_idx
  on public.web_mvp_rule_trials (session_id, routine_key)
  where status = 'active';

create index web_mvp_rule_trials_session_date_idx
  on public.web_mvp_rule_trials (session_id, started_on desc);

alter table public.web_mvp_rule_trials enable row level security;

comment on column public.web_mvp_routine_items.dependency_kinds is '사용자가 지정하거나 온주가 제안한 루틴 선행조건.';
comment on table public.web_mvp_rule_trials is '반복 실패 신호에 대해 사용자가 승인한 14일 구조 실험.';

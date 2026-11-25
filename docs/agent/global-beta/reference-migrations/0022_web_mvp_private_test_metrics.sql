-- 비공개 사용자 테스트 계측. 대화 원문은 저장하지 않고 익명 세션별 진행·오류·비용 지표만 보관한다.

create table public.web_mvp_test_events (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid(),
  session_id uuid not null references public.web_mvp_agent_sessions(session_id) on delete cascade,
  event_name text not null check (event_name ~ '^[a-z0-9_]{3,48}$'),
  source text not null check (source in ('client', 'agent', 'plan', 'plan_revision', 'daily')),
  stage smallint check (stage between 0 and 5),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (session_id, event_id)
);

create index web_mvp_test_events_session_created_idx
  on public.web_mvp_test_events (session_id, created_at);

create index web_mvp_test_events_name_created_idx
  on public.web_mvp_test_events (event_name, created_at desc);

alter table public.web_mvp_test_events enable row level security;

create view public.web_mvp_private_test_summary
with (security_invoker = true)
as
select
  event.session_id,
  min(event.created_at) as first_seen_at,
  max(event.created_at) as last_seen_at,
  count(*) filter (where event.event_name = 'agent_turn_completed') as conversation_turns,
  coalesce(sum((event.metadata ->> 'input_characters')::integer)
    filter (where event.event_name = 'agent_turn_completed'), 0) as user_input_characters,
  coalesce(sum((event.metadata ->> 'retries')::integer), 0) as retries,
  coalesce(sum((event.metadata ->> 'model_calls')::integer), 0) as model_calls,
  coalesce(sum((event.metadata ->> 'estimated_cost_usd')::numeric), 0) as estimated_cost_usd,
  count(*) filter (where coalesce((event.metadata ->> 'draft_offered')::boolean, false)) as approval_offers,
  count(*) filter (where coalesce((event.metadata ->> 'approval_accepted')::boolean, false)) as approvals_accepted,
  max(event.stage) as furthest_stage,
  bool_or(event.event_name = 'setup_completed') as setup_completed,
  count(*) filter (where event.event_name in ('agent_ui_failure', 'plan_generation_failed')) as user_visible_failures,
  round(extract(epoch from (max(event.created_at) - min(event.created_at))))::bigint as observed_seconds
from public.web_mvp_test_events event
group by event.session_id;

revoke all on table public.web_mvp_test_events from public, anon, authenticated;
revoke all on table public.web_mvp_private_test_summary from public, anon, authenticated;
grant select, insert on table public.web_mvp_test_events to service_role;
grant usage, select on sequence public.web_mvp_test_events_id_seq to service_role;
grant select on table public.web_mvp_private_test_summary to service_role;

comment on table public.web_mvp_test_events is '온주 비공개 테스트의 익명 행동·품질 지표. 대화 원문과 개인 식별 정보는 저장하지 않는다.';
comment on view public.web_mvp_private_test_summary is '익명 세션별 설정 완료, 입력량, 재시도, 승인, 모델 비용 요약.';

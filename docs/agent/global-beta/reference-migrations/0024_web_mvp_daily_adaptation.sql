-- 하루의 실제 실행 결과를 다음 실행에 연결하는 승인형 적응 기록을 추가한다.
-- 기존 주간 계획은 바꾸지 않고, 하루 단위의 임시 조정만 사용자 승인 후 적용한다.

alter table public.web_mvp_routine_items
  add column planning_style text not null default 'repeat'
    check (planning_style in ('repeat', 'progression')),
  add column action_index integer not null default -1,
  add column week_index integer not null default 1 check (week_index >= 1),
  add column progress_index integer not null default 0 check (progress_index >= 0),
  add column sequence_index integer not null default 0 check (sequence_index >= 0),
  add column milestone_id text not null default '',
  add column depends_on_sequence_index integer not null default 0 check (depends_on_sequence_index >= 0),
  add column completion_evidence text not null default '',
  add column input_artifact text not null default '';

create table public.web_mvp_daily_adaptations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.web_mvp_agent_sessions(session_id) on delete cascade,
  source_date date not null,
  target_date date not null check (target_date > source_date),
  source_plan_item_id text not null check (char_length(source_plan_item_id) between 1 and 120),
  target_plan_item_id text not null check (char_length(target_plan_item_id) between 1 and 120),
  routine_key text not null check (char_length(routine_key) between 1 and 180),
  status text not null default 'proposed' check (status in ('proposed', 'applied', 'dismissed')),
  revision integer not null default 0 check (revision >= 0),
  evidence_signature text not null check (char_length(evidence_signature) between 1 and 2000),
  source_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(source_snapshot) = 'object'),
  recommendation jsonb not null default '{}'::jsonb check (jsonb_typeof(recommendation) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (session_id, source_date)
);

create index web_mvp_daily_adaptations_session_target_idx
  on public.web_mvp_daily_adaptations (session_id, target_date desc);

alter table public.web_mvp_daily_adaptations enable row level security;

create or replace function public.web_mvp_sync_routine_plan(
  p_session_id uuid,
  p_plan jsonb,
  p_changed_on date
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if jsonb_typeof(p_plan) <> 'array' then
    raise exception 'invalid_plan';
  end if;

  update public.web_mvp_routine_items
  set active = false,
      deactivated_on = p_changed_on - 1,
      updated_at = now()
  where session_id = p_session_id
    and active
    and not exists (
      select 1 from jsonb_array_elements(p_plan) as entry(value)
      where entry.value->>'source_plan_item_id' = web_mvp_routine_items.source_plan_item_id
    );

  insert into public.web_mvp_routine_items as current (
    session_id, source_plan_item_id, routine_key, day_index, title,
    minimum_action, start_time, end_time, active, activated_on,
    deactivated_on, planning_style, action_index, week_index,
    progress_index, sequence_index, milestone_id,
    depends_on_sequence_index, completion_evidence, input_artifact, updated_at
  )
  select
    p_session_id,
    value->>'source_plan_item_id',
    value->>'routine_key',
    (value->>'day_index')::smallint,
    value->>'title',
    coalesce(value->>'minimum_action', ''),
    nullif(value->>'start_time', '')::time,
    nullif(value->>'end_time', '')::time,
    true,
    p_changed_on,
    null,
    case when value->>'planning_style' = 'progression' then 'progression' else 'repeat' end,
    greatest(-1, coalesce((value->>'action_index')::integer, -1)),
    greatest(1, coalesce((value->>'week_index')::integer, 1)),
    greatest(0, coalesce((value->>'progress_index')::integer, 0)),
    greatest(0, coalesce((value->>'sequence_index')::integer, 0)),
    coalesce(value->>'milestone_id', ''),
    greatest(0, coalesce((value->>'depends_on_sequence_index')::integer, 0)),
    coalesce(value->>'completion_evidence', ''),
    coalesce(value->>'input_artifact', ''),
    now()
  from jsonb_array_elements(p_plan)
  on conflict (session_id, source_plan_item_id) do update
  set routine_key = excluded.routine_key,
      day_index = excluded.day_index,
      title = excluded.title,
      minimum_action = excluded.minimum_action,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      planning_style = excluded.planning_style,
      action_index = excluded.action_index,
      week_index = excluded.week_index,
      progress_index = excluded.progress_index,
      sequence_index = excluded.sequence_index,
      milestone_id = excluded.milestone_id,
      depends_on_sequence_index = excluded.depends_on_sequence_index,
      completion_evidence = excluded.completion_evidence,
      input_artifact = excluded.input_artifact,
      active = true,
      activated_on = case when current.active then current.activated_on else excluded.activated_on end,
      deactivated_on = null,
      updated_at = now();
end;
$$;

revoke all on table public.web_mvp_daily_adaptations from public, anon, authenticated;
revoke all on function public.web_mvp_sync_routine_plan(uuid, jsonb, date) from public, anon, authenticated;
grant execute on function public.web_mvp_sync_routine_plan(uuid, jsonb, date) to service_role;

comment on table public.web_mvp_daily_adaptations is '당일 실행 증거를 다음 실행의 승인형 임시 조정으로 연결한 기록.';
comment on column public.web_mvp_daily_adaptations.evidence_signature is '조정 제안 이후 원본 실행 기록이 바뀌었는지 확인하는 서명.';
comment on column public.web_mvp_routine_items.input_artifact is '프로젝트 실행 단계가 시작할 때 소비해야 하는 앞 단계 결과물.';

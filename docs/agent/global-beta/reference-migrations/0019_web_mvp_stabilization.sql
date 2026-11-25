-- Web MVP 안정화: 익명 세션 소유권, 호출 제한, 최소 실행, 계획 유효기간,
-- 일일 기록 단일화, 원자적 계획 동기화와 구조 실험 시작을 함께 보강한다.

alter table public.web_mvp_agent_sessions
  add column access_token_hash text;

alter table public.web_mvp_daily_logs
  add column agent_checkin jsonb not null default '{}'::jsonb
    check (jsonb_typeof(agent_checkin) = 'object');

alter table public.web_mvp_routine_items
  add column activated_on date,
  add column deactivated_on date;

update public.web_mvp_routine_items
set activated_on = (created_at at time zone 'Asia/Seoul')::date
where activated_on is null;

alter table public.web_mvp_routine_items
  alter column activated_on set not null,
  alter column activated_on set default ((now() at time zone 'Asia/Seoul')::date),
  add constraint web_mvp_routine_items_active_range_valid
    check (deactivated_on is null or deactivated_on >= activated_on - 1);

alter table public.web_mvp_item_logs
  drop constraint if exists web_mvp_item_logs_status_check;

alter table public.web_mvp_item_logs
  add constraint web_mvp_item_logs_status_check
    check (status in ('completed', 'minimum', 'missed', 'exception'));

alter table public.web_mvp_checkin_sessions
  drop constraint if exists web_mvp_checkin_sessions_step_check;

alter table public.web_mvp_checkin_sessions
  add constraint web_mvp_checkin_sessions_step_check check (step between 0 and 32);

create table public.web_mvp_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.web_mvp_rate_limits enable row level security;

create or replace function public.web_mvp_consume_rate_limit(
  p_bucket_key text,
  p_now timestamptz,
  p_window_seconds integer,
  p_limit integer
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_bucket public.web_mvp_rate_limits%rowtype;
begin
  if char_length(p_bucket_key) < 8 or p_window_seconds < 1 or p_limit < 1 then
    raise exception 'invalid_rate_limit';
  end if;

  select * into current_bucket
  from public.web_mvp_rate_limits
  where bucket_key = p_bucket_key
  for update;

  if not found then
    insert into public.web_mvp_rate_limits (bucket_key, window_started_at, request_count, updated_at)
    values (p_bucket_key, p_now, 1, p_now);
    return true;
  end if;

  if p_now >= current_bucket.window_started_at + make_interval(secs => p_window_seconds) then
    update public.web_mvp_rate_limits
    set window_started_at = p_now, request_count = 1, updated_at = p_now
    where bucket_key = p_bucket_key;
    return true;
  end if;

  if current_bucket.request_count >= p_limit then
    return false;
  end if;

  update public.web_mvp_rate_limits
  set request_count = request_count + 1, updated_at = p_now
  where bucket_key = p_bucket_key;
  return true;
end;
$$;

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
    deactivated_on, updated_at
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
    now()
  from jsonb_array_elements(p_plan)
  on conflict (session_id, source_plan_item_id) do update
  set routine_key = excluded.routine_key,
      day_index = excluded.day_index,
      title = excluded.title,
      minimum_action = excluded.minimum_action,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      active = true,
      activated_on = case when current.active then current.activated_on else excluded.activated_on end,
      deactivated_on = null,
      updated_at = now();
end;
$$;

create or replace function public.web_mvp_start_rule_trial(
  p_session_id uuid,
  p_routine_key text,
  p_signal_type text,
  p_dependency_kind text,
  p_strategy_id text,
  p_strategy text,
  p_rationale text,
  p_started_on date,
  p_trial_until date
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  trial_id uuid;
  changed_count integer;
begin
  insert into public.web_mvp_rule_trials (
    session_id, routine_key, signal_type, dependency_kind, strategy_id,
    strategy, rationale, started_on, trial_until, status
  ) values (
    p_session_id, p_routine_key, p_signal_type, p_dependency_kind, p_strategy_id,
    p_strategy, coalesce(p_rationale, ''), p_started_on, p_trial_until, 'active'
  ) returning id into trial_id;

  update public.web_mvp_routine_items
  set active_strategy = p_strategy,
      strategy_trial_until = p_trial_until,
      strategy_state = 'trial',
      dependency_kinds = array[p_dependency_kind],
      updated_at = now()
  where session_id = p_session_id and routine_key = p_routine_key and active;

  get diagnostics changed_count = row_count;
  if changed_count = 0 then
    raise exception 'routine_not_found';
  end if;

  return trial_id;
end;
$$;

revoke all on table public.web_mvp_rate_limits from public, anon, authenticated;
revoke all on function public.web_mvp_consume_rate_limit(text, timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.web_mvp_sync_routine_plan(uuid, jsonb, date) from public, anon, authenticated;
revoke all on function public.web_mvp_start_rule_trial(uuid, text, text, text, text, text, text, date, date) from public, anon, authenticated;

grant execute on function public.web_mvp_consume_rate_limit(text, timestamptz, integer, integer) to service_role;
grant execute on function public.web_mvp_sync_routine_plan(uuid, jsonb, date) to service_role;
grant execute on function public.web_mvp_start_rule_trial(uuid, text, text, text, text, text, text, date, date) to service_role;

comment on column public.web_mvp_agent_sessions.access_token_hash is '브라우저에만 보관하는 익명 세션 접근 토큰의 SHA-256 해시.';
comment on column public.web_mvp_daily_logs.agent_checkin is '대화형 에이전트와 오늘 화면이 공유하는 날짜별 자유형 점검 기록.';
comment on column public.web_mvp_routine_items.activated_on is '이 계획 항목이 현재 형태로 적용되기 시작한 한국 날짜.';
comment on column public.web_mvp_routine_items.deactivated_on is '이 계획 항목이 적용된 마지막 한국 날짜. 활성 항목은 null.';

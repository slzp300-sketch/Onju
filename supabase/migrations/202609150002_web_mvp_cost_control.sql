-- Additive offline stage 3. Reconcile historical migrations before deployment.
-- Amounts are estimated micro-USD, NOT the provider's invoiced total.
create table public.web_mvp_ai_cost_days (
  scope text not null check (scope in ('public','evaluation')),
  budget_date date not null,
  charged_microusd bigint not null default 0 check (charged_microusd >= 0),
  primary key(scope,budget_date)
);
create table public.web_mvp_ai_calls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.web_mvp_agent_sessions(session_id) on delete cascade,
  scope text not null check (scope in ('public','evaluation')),
  call_key text not null check (call_key ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  budget_date date not null,
  reserved_microusd bigint not null check (reserved_microusd > 0),
  charged_microusd bigint not null check (charged_microusd >= 0),
  actual_microusd bigint check (actual_microusd >= 0),
  state text not null check (state in ('reserved','completed','rejected','unknown')),
  response jsonb,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  check ((state = 'completed') = (response is not null))
);
create unique index web_mvp_ai_calls_active_key on public.web_mvp_ai_calls(session_id,scope,call_key) where state <> 'rejected';
create index web_mvp_ai_calls_session_date on public.web_mvp_ai_calls(session_id,scope,budget_date,created_at);
create trigger web_mvp_guard_child_session before insert or update on public.web_mvp_ai_calls
  for each row execute function public.web_mvp_guard_child_session();
alter table public.web_mvp_ai_calls enable row level security;
alter table public.web_mvp_ai_cost_days enable row level security;
revoke all on public.web_mvp_ai_calls, public.web_mvp_ai_cost_days from public, anon, authenticated;
grant all on public.web_mvp_ai_calls, public.web_mvp_ai_cost_days to service_role;

-- Carry forward known reservations/spend; an old budget is not reset on rollout.
-- Drain OLD calls before this migration, then switch ALL endpoints together.
do $$
begin
  if to_regclass('public.web_mvp_ai_daily_budget') is not null then
    execute 'insert into public.web_mvp_ai_cost_days select ''public'',budget_date,actual_microusd+pending_microusd from public.web_mvp_ai_daily_budget';
  end if;
  if to_regclass('public.web_mvp_ai_evaluation_daily_budget') is not null then
    execute 'insert into public.web_mvp_ai_cost_days select ''evaluation'',budget_date,actual_microusd+pending_microusd from public.web_mvp_ai_evaluation_daily_budget';
  end if;
end $$;

create or replace function public.web_mvp_begin_ai_call(
  p_session_id uuid, p_scope text, p_call_key text, p_payload_hash text,
  p_reserved bigint, p_daily_limit bigint, p_session_limit bigint,
  p_minute_calls integer, p_day_calls integer
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_date date := (now() at time zone 'Asia/Seoul')::date;
  prior public.web_mvp_ai_calls%rowtype;
  session_cost bigint; minute_calls bigint; day_calls bigint; call_id uuid;
begin
  if p_session_id is null or p_scope is null or p_scope not in ('public','evaluation')
    or p_call_key is null or p_call_key !~ '^[0-9a-f]{64}$'
    or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_reserved is null or p_reserved <= 0 or p_daily_limit is null or p_daily_limit < 0
    or p_session_limit is null or p_session_limit < 0
    or p_minute_calls is null or p_minute_calls < 0 or p_day_calls is null or p_day_calls < 0 then
    raise exception 'invalid_ai_budget';
  end if;
  -- A single lock order for reservation AND settlement, including midnight.
  perform pg_advisory_xact_lock(hashtextextended('onju-ai-cost:' || p_scope, 0));
  perform 1 from public.web_mvp_agent_sessions where session_id=p_session_id
    and access_token_hash is not null and expires_at > now() for key share;
  if not found then raise exception 'session_expired'; end if;
  select * into prior from public.web_mvp_ai_calls
    where session_id=p_session_id and scope=p_scope and call_key=p_call_key and state <> 'rejected';
  if found then
    if prior.payload_hash <> p_payload_hash then return jsonb_build_object('state','changed'); end if;
    if prior.state = 'completed' then return jsonb_build_object('state','replay','response',prior.response); end if;
    if prior.state = 'unknown' or prior.created_at < now() - interval '3 minutes' then
      return jsonb_build_object('state','unknown');
    end if;
    return jsonb_build_object('state','running');
  end if;
  -- A rejected attempt keeps its accounting row, and may be retried with a
  -- NEW reservation ID. The same key may never change the user's payload.
  if exists(select 1 from public.web_mvp_ai_calls where session_id=p_session_id and scope=p_scope and call_key=p_call_key and payload_hash<>p_payload_hash) then
    return jsonb_build_object('state','changed');
  end if;
  select coalesce(sum(charged_microusd) filter(where budget_date=v_date),0),
    count(*) filter(where created_at > now()-interval '1 minute'),
    count(*) filter(where budget_date=v_date)
    into session_cost,minute_calls,day_calls
    from public.web_mvp_ai_calls where session_id=p_session_id and scope=p_scope;
  if minute_calls >= p_minute_calls or day_calls >= p_day_calls then return jsonb_build_object('state','rate_limit'); end if;
  if session_cost + p_reserved > p_session_limit then return jsonb_build_object('state','session_limit'); end if;
  insert into public.web_mvp_ai_cost_days(scope,budget_date) values(p_scope,v_date) on conflict do nothing;
  update public.web_mvp_ai_cost_days set charged_microusd=charged_microusd+p_reserved
    where scope=p_scope and budget_date=v_date and charged_microusd+p_reserved <= p_daily_limit;
  if not found then return jsonb_build_object('state','global_limit'); end if;
  insert into public.web_mvp_ai_calls(session_id,scope,call_key,payload_hash,budget_date,reserved_microusd,charged_microusd,state)
    values(p_session_id,p_scope,p_call_key,p_payload_hash,v_date,p_reserved,p_reserved,'reserved') returning id into call_id;
  return jsonb_build_object('state','reserved','id',call_id);
end $$;

create or replace function public.web_mvp_finish_ai_call(p_id uuid,p_state text,p_actual bigint,p_response jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare prior public.web_mvp_ai_calls%rowtype; charge bigint; call_scope text;
begin
  if p_state is null or p_state not in ('completed','rejected','unknown') or p_actual < 0
    or (p_state='completed') <> (p_response is not null) then raise exception 'invalid_ai_settlement'; end if;
  select scope into call_scope from public.web_mvp_ai_calls where id=p_id;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('onju-ai-cost:' || call_scope, 0));
  select * into prior from public.web_mvp_ai_calls where id=p_id for update;
  if not found then return false; end if;
  if prior.state <> 'reserved' then return true; end if; -- once only, even if caller retries
  charge := coalesce(p_actual,prior.reserved_microusd);
  -- Never move yesterday's pending reservation into today's budget.
  update public.web_mvp_ai_cost_days set charged_microusd=charged_microusd-prior.charged_microusd+charge
    where scope=prior.scope and budget_date=prior.budget_date;
  if not found then raise exception 'missing_ai_budget_day'; end if;
  update public.web_mvp_ai_calls set state=p_state, actual_microusd=p_actual,
    charged_microusd=charge,response=p_response,settled_at=now() where id=p_id;
  return true;
end $$;
revoke all on function public.web_mvp_begin_ai_call(uuid,text,text,text,bigint,bigint,bigint,integer,integer) from public,anon,authenticated;
revoke all on function public.web_mvp_finish_ai_call(uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.web_mvp_begin_ai_call(uuid,text,text,text,bigint,bigint,bigint,integer,integer) to service_role;
grant execute on function public.web_mvp_finish_ai_call(uuid,text,bigint,jsonb) to service_role;
comment on table public.web_mvp_ai_calls is 'Server-only call recovery ledger; null actual cost means unknown, not zero. Response cache is deleted with the owning session. Global daily accounting survives session deletion.';

-- Prevent old amount-only workers from continuing on a separate ledger after
-- cutover. Drain first; rollback requires reconciliation, not blindly regranting.
do $$ declare signature text; item regprocedure;
begin
  foreach signature in array array[
    'public.web_mvp_reserve_ai_budget(bigint,bigint)',
    'public.web_mvp_settle_ai_budget(bigint,bigint)',
    'public.web_mvp_reserve_ai_evaluation_budget(bigint,bigint)',
    'public.web_mvp_settle_ai_evaluation_budget(bigint,bigint)'
  ] loop
    item := to_regprocedure(signature);
    if item is not null then execute format('revoke execute on function %s from service_role',item); end if;
  end loop;
end $$;

-- Atomic rate bucket creation; use server time, not a supplied timestamp.
create table if not exists public.web_mvp_rate_limits (
  bucket_key text primary key,window_started_at timestamptz not null,
  request_count integer not null check(request_count >= 0),updated_at timestamptz not null default now()
);
alter table public.web_mvp_rate_limits enable row level security;
revoke all on public.web_mvp_rate_limits from public,anon,authenticated;
grant all on public.web_mvp_rate_limits to service_role;
create or replace function public.web_mvp_consume_rate_limit(p_bucket_key text,p_now timestamptz,p_window_seconds integer,p_limit integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare used integer;
begin
  if p_bucket_key is null or length(p_bucket_key)<8 or p_window_seconds is null or p_window_seconds<1 or p_limit is null or p_limit<1 then return false; end if;
  insert into public.web_mvp_rate_limits as b(bucket_key,window_started_at,request_count,updated_at)
    values(p_bucket_key,now(),1,now())
    on conflict(bucket_key) do update set
      request_count=case when b.window_started_at+make_interval(secs=>p_window_seconds)<=now() then 1 else b.request_count+1 end,
      window_started_at=case when b.window_started_at+make_interval(secs=>p_window_seconds)<=now() then now() else b.window_started_at end,
      updated_at=now()
    where b.request_count<p_limit or b.window_started_at+make_interval(secs=>p_window_seconds)<=now()
    returning request_count into used;
  return found;
end $$;
revoke all on function public.web_mvp_consume_rate_limit(text,timestamptz,integer,integer) from public,anon,authenticated;
grant execute on function public.web_mvp_consume_rate_limit(text,timestamptz,integer,integer) to service_role;

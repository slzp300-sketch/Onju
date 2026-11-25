create table if not exists public.web_mvp_ai_daily_budget (
  budget_date date primary key,
  reserved_microusd bigint not null default 0 check (reserved_microusd >= 0),
  actual_microusd bigint not null default 0 check (actual_microusd >= 0),
  request_count bigint not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.web_mvp_ai_daily_budget enable row level security;
revoke all on table public.web_mvp_ai_daily_budget from anon, authenticated;
grant all on table public.web_mvp_ai_daily_budget to service_role;

create or replace function public.web_mvp_reserve_ai_budget(
  p_reserved_microusd bigint,
  p_daily_limit_microusd bigint
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_reserved_microusd <= 0 or p_daily_limit_microusd <= 0 then
    return false;
  end if;

  insert into public.web_mvp_ai_daily_budget (budget_date)
  values (v_date)
  on conflict (budget_date) do nothing;

  update public.web_mvp_ai_daily_budget
  set reserved_microusd = reserved_microusd + p_reserved_microusd,
      request_count = request_count + 1,
      updated_at = now()
  where budget_date = v_date
    and reserved_microusd + p_reserved_microusd <= p_daily_limit_microusd;

  return found;
end;
$$;

create or replace function public.web_mvp_record_ai_spend(
  p_actual_microusd bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_actual_microusd <= 0 then
    return;
  end if;

  insert into public.web_mvp_ai_daily_budget (budget_date, actual_microusd)
  values (v_date, p_actual_microusd)
  on conflict (budget_date) do update
    set actual_microusd = public.web_mvp_ai_daily_budget.actual_microusd + excluded.actual_microusd,
        updated_at = now();
end;
$$;

revoke all on function public.web_mvp_reserve_ai_budget(bigint, bigint) from public, anon, authenticated;
revoke all on function public.web_mvp_record_ai_spend(bigint) from public, anon, authenticated;
grant execute on function public.web_mvp_reserve_ai_budget(bigint, bigint) to service_role;
grant execute on function public.web_mvp_record_ai_spend(bigint) to service_role;

comment on table public.web_mvp_ai_daily_budget is 'KST daily public-beta AI reservation and estimated spend totals.';
comment on function public.web_mvp_reserve_ai_budget(bigint, bigint) is 'Atomically reserves estimated AI cost while enforcing the global daily limit.';
comment on function public.web_mvp_record_ai_spend(bigint) is 'Records estimated actual AI spend from model usage.';

alter table public.web_mvp_ai_daily_budget
  add column if not exists pending_microusd bigint not null default 0
  check (pending_microusd >= 0);

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
      pending_microusd = pending_microusd + p_reserved_microusd,
      request_count = request_count + 1,
      updated_at = now()
  where budget_date = v_date
    and actual_microusd + pending_microusd + p_reserved_microusd <= p_daily_limit_microusd;

  return found;
end;
$$;

create or replace function public.web_mvp_settle_ai_budget(
  p_reserved_microusd bigint,
  p_actual_microusd bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_reserved_microusd < 0 or p_actual_microusd < 0 then
    raise exception 'budget amounts must not be negative';
  end if;

  insert into public.web_mvp_ai_daily_budget (
    budget_date,
    actual_microusd
  ) values (
    v_date,
    p_actual_microusd
  )
  on conflict (budget_date) do update
    set pending_microusd = greatest(
          0,
          public.web_mvp_ai_daily_budget.pending_microusd - p_reserved_microusd
        ),
        actual_microusd = public.web_mvp_ai_daily_budget.actual_microusd + excluded.actual_microusd,
        updated_at = now();
end;
$$;

revoke all on function public.web_mvp_settle_ai_budget(bigint, bigint) from public, anon, authenticated;
grant execute on function public.web_mvp_settle_ai_budget(bigint, bigint) to service_role;

comment on column public.web_mvp_ai_daily_budget.pending_microusd is 'Estimated cost reserved by requests that have not settled yet.';
comment on function public.web_mvp_settle_ai_budget(bigint, bigint) is 'Releases one pending reservation and records the request actual estimated cost.';

-- 구조 실험 종료 뒤 사용자가 유지·수정·중단을 결정할 수 있게 한다.
-- 근거가 부족한 실험은 한 번만 7일 연장한다.

alter table public.web_mvp_routine_items
  add column strategy_state text not null default 'none'
    check (strategy_state in ('none', 'trial', 'adopted'));

update public.web_mvp_routine_items
set strategy_state = 'trial'
where active_strategy <> '' and strategy_trial_until is not null;

alter table public.web_mvp_rule_trials
  add column reviewed_on date,
  add column result jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result) = 'object'),
  add column extension_count smallint not null default 0
    check (extension_count between 0 and 1);

comment on column public.web_mvp_routine_items.strategy_state is '구조 전략 적용 상태: 없음, 시험 중, 채택.';
comment on column public.web_mvp_rule_trials.result is '실험 종료 시 서버가 계산한 실행 근거 스냅샷.';

create or replace function public.web_mvp_review_rule_trial(
  p_trial_id uuid,
  p_session_id uuid,
  p_decision text,
  p_reviewed_on date,
  p_result jsonb,
  p_next_strategy_id text,
  p_next_strategy text,
  p_next_rationale text,
  p_next_trial_until date
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_trial public.web_mvp_rule_trials%rowtype;
begin
  select * into current_trial
  from public.web_mvp_rule_trials
  where id = p_trial_id and session_id = p_session_id and status = 'active'
  for update;

  if not found then
    raise exception 'trial_not_found';
  end if;

  if p_decision = 'extend' then
    if current_trial.extension_count >= 1 or p_next_trial_until <= current_trial.trial_until then
      raise exception 'trial_cannot_extend';
    end if;
    update public.web_mvp_rule_trials
    set trial_until = p_next_trial_until,
        extension_count = extension_count + 1,
        updated_at = now()
    where id = current_trial.id;
    update public.web_mvp_routine_items
    set strategy_trial_until = p_next_trial_until,
        strategy_state = 'trial',
        updated_at = now()
    where session_id = p_session_id and routine_key = current_trial.routine_key;
    return;
  end if;

  if p_decision not in ('keep', 'modify', 'stop') then
    raise exception 'invalid_trial_decision';
  end if;

  update public.web_mvp_rule_trials
  set status = case when p_decision = 'stop' then 'cancelled' else 'completed' end,
      verdict = p_decision,
      reviewed_on = p_reviewed_on,
      result = p_result,
      updated_at = now()
  where id = current_trial.id;

  if p_decision = 'keep' then
    update public.web_mvp_routine_items
    set strategy_state = 'adopted',
        strategy_trial_until = null,
        updated_at = now()
    where session_id = p_session_id and routine_key = current_trial.routine_key;
  elsif p_decision = 'stop' then
    update public.web_mvp_routine_items
    set strategy_state = 'none',
        active_strategy = '',
        strategy_trial_until = null,
        updated_at = now()
    where session_id = p_session_id and routine_key = current_trial.routine_key;
  else
    if coalesce(p_next_strategy_id, '') = '' or coalesce(p_next_strategy, '') = '' then
      raise exception 'next_strategy_required';
    end if;
    insert into public.web_mvp_rule_trials (
      session_id, routine_key, signal_type, dependency_kind,
      strategy_id, strategy, rationale, started_on, trial_until, status
    ) values (
      p_session_id, current_trial.routine_key, current_trial.signal_type, current_trial.dependency_kind,
      p_next_strategy_id, p_next_strategy, coalesce(p_next_rationale, ''), p_reviewed_on, p_next_trial_until, 'active'
    );
    update public.web_mvp_routine_items
    set strategy_state = 'trial',
        active_strategy = p_next_strategy,
        strategy_trial_until = p_next_trial_until,
        updated_at = now()
    where session_id = p_session_id and routine_key = current_trial.routine_key;
  end if;
end;
$$;

revoke all on function public.web_mvp_review_rule_trial(uuid, uuid, text, date, jsonb, text, text, text, date) from public, anon, authenticated;
grant execute on function public.web_mvp_review_rule_trial(uuid, uuid, text, date, jsonb, text, text, text, date) to service_role;

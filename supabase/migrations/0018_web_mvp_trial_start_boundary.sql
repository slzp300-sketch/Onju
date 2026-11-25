-- 구조를 선택한 당일의 기존 기록이 새 실험 결과에 섞이지 않도록
-- 수정 실험은 다음 한국 날짜부터 시작한다.

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

  if not found then raise exception 'trial_not_found'; end if;

  if p_decision = 'extend' then
    if current_trial.extension_count >= 1 or p_next_trial_until <= current_trial.trial_until then
      raise exception 'trial_cannot_extend';
    end if;
    update public.web_mvp_rule_trials
    set trial_until = p_next_trial_until, extension_count = extension_count + 1, updated_at = now()
    where id = current_trial.id;
    update public.web_mvp_routine_items
    set strategy_trial_until = p_next_trial_until, strategy_state = 'trial', updated_at = now()
    where session_id = p_session_id and routine_key = current_trial.routine_key;
    return;
  end if;

  if p_decision not in ('keep', 'modify', 'stop') then raise exception 'invalid_trial_decision'; end if;

  update public.web_mvp_rule_trials
  set status = case when p_decision = 'stop' then 'cancelled' else 'completed' end,
      verdict = p_decision, reviewed_on = p_reviewed_on, result = p_result, updated_at = now()
  where id = current_trial.id;

  if p_decision = 'keep' then
    update public.web_mvp_routine_items
    set strategy_state = 'adopted', strategy_trial_until = null, updated_at = now()
    where session_id = p_session_id and routine_key = current_trial.routine_key;
  elsif p_decision = 'stop' then
    update public.web_mvp_routine_items
    set strategy_state = 'none', active_strategy = '', strategy_trial_until = null, updated_at = now()
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
      p_next_strategy_id, p_next_strategy, coalesce(p_next_rationale, ''), p_reviewed_on + 1, p_next_trial_until, 'active'
    );
    update public.web_mvp_routine_items
    set strategy_state = 'trial', active_strategy = p_next_strategy,
        strategy_trial_until = p_next_trial_until, updated_at = now()
    where session_id = p_session_id and routine_key = current_trial.routine_key;
  end if;
end;
$$;

revoke all on function public.web_mvp_review_rule_trial(uuid, uuid, text, date, jsonb, text, text, text, date) from public, anon, authenticated;
grant execute on function public.web_mvp_review_rule_trial(uuid, uuid, text, date, jsonb, text, text, text, date) to service_role;

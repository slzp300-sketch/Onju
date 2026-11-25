-- 비공개 사용자 테스트 요약에는 실제 설정 화면 방문만 포함하고,
-- 30일이 지난 익명 세션과 연결 데이터를 작은 배치로 정리한다.

create or replace view public.web_mvp_private_test_summary
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
group by event.session_id
having count(*) filter (where event.event_name = 'setup_opened') > 0;

create or replace function public.web_mvp_cleanup_expired_sessions(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  with expired as (
    select session_id
    from public.web_mvp_agent_sessions
    where expires_at < now()
    order by expires_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  )
  delete from public.web_mvp_agent_sessions session
  using expired
  where session.session_id = expired.session_id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.web_mvp_cleanup_expired_sessions(integer) from public, anon, authenticated;
grant execute on function public.web_mvp_cleanup_expired_sessions(integer) to service_role;

comment on function public.web_mvp_cleanup_expired_sessions(integer)
  is '만료된 익명 웹 MVP 세션과 cascade 연결 데이터를 최대 500개씩 정리한다.';

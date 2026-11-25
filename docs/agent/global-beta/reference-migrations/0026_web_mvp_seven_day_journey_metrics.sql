-- 첫 7일 실사용 판단에 필요한 익명 행동 지표를 기존 비공개 테스트 요약에 추가한다.
-- 대화 원문, 목표 내용, 일정 내용은 포함하지 않는다.

create or replace view public.web_mvp_private_test_summary
with (security_invoker = true)
as
with event_with_journey as (
  select
    event.*,
    (event.created_at at time zone 'Asia/Seoul')::date as korea_event_date,
    min((event.created_at at time zone 'Asia/Seoul')::date)
      filter (where event.event_name = 'today_opened')
      over (partition by event.session_id) as first_daily_date
  from public.web_mvp_test_events event
)
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
  round(extract(epoch from (max(event.created_at) - min(event.created_at))))::bigint as observed_seconds,
  min(event.created_at) filter (where event.event_name = 'today_opened') as first_daily_seen_at,
  max(event.created_at) filter (where event.event_name = 'today_opened') as last_daily_seen_at,
  count(distinct event.korea_event_date) filter (
    where event.event_name in (
      'today_opened', 'daily_checkin_started', 'daily_checkin_completed',
      'daily_item_recorded', 'daily_adaptation_decided', 'weekly_review_started',
      'weekly_review_applied', 'reminder_enabled', 'reminder_calendar_exported'
    )
    and event.korea_event_date between event.first_daily_date and event.first_daily_date + 6
  ) as first_week_active_days,
  bool_or(event.korea_event_date = event.first_daily_date + 1) filter (
    where event.event_name in ('today_opened', 'daily_checkin_started', 'daily_checkin_completed', 'daily_item_recorded')
  ) as returned_next_day,
  count(distinct (event.korea_event_date, event.metadata ->> 'checkin_type')) filter (
    where event.event_name = 'daily_checkin_completed'
    and event.metadata ->> 'checkin_type' = 'morning'
    and event.korea_event_date between event.first_daily_date and event.first_daily_date + 6
  ) as first_week_morning_checkins,
  count(distinct (event.korea_event_date, event.metadata ->> 'checkin_type')) filter (
    where event.event_name = 'daily_checkin_completed'
    and event.metadata ->> 'checkin_type' = 'closing'
    and event.korea_event_date between event.first_daily_date and event.first_daily_date + 6
  ) as first_week_closing_checkins,
  count(distinct event.korea_event_date) filter (
    where event.event_name = 'daily_item_recorded'
    and event.korea_event_date between event.first_daily_date and event.first_daily_date + 6
  ) as first_week_item_record_days,
  count(*) filter (
    where event.event_name = 'daily_adaptation_decided'
    and event.korea_event_date between event.first_daily_date and event.first_daily_date + 6
  ) as first_week_adaptation_decisions,
  bool_or(event.event_name = 'weekly_review_applied'
    and event.korea_event_date between event.first_daily_date and event.first_daily_date + 6) as first_week_review_applied,
  ((now() at time zone 'Asia/Seoul')::date >= event.first_daily_date + 6) as first_week_observation_elapsed
from event_with_journey event
group by event.session_id, event.first_daily_date
having count(*) filter (where event.event_name = 'setup_opened') > 0;

revoke all on table public.web_mvp_private_test_summary from public, anon, authenticated;
grant select on table public.web_mvp_private_test_summary to service_role;

comment on view public.web_mvp_private_test_summary is
  '익명 세션별 설정·비용·오류와 첫 7일 재방문·점검·실행·회고 지표 요약. 대화 원문은 포함하지 않는다.';

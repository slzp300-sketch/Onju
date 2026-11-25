-- 공개 베타 운영자가 대화 원문과 세션 식별자 없이 퍼널·안정성·유지율을 확인한다.
-- public_beta_started 이벤트가 있는 세션만 집계해 내부 개발 테스트와 분리한다.

create or replace view public.web_mvp_public_beta_operations
with (security_invoker = true)
as
with public_sessions as (
  select
    event.session_id,
    coalesce(
      max(event.metadata ->> 'acquisition_source') filter (
        where event.event_name in ('public_beta_started', 'setup_opened')
        and event.metadata ->> 'acquisition_source' in ('direct', 'friend', 'community', 'contest', 'other')
      ),
      'direct'
    ) as acquisition_source
  from public.web_mvp_test_events event
  group by event.session_id
  having bool_or(event.event_name = 'public_beta_started')
),
tester as (
  select summary.*, public_sessions.acquisition_source
  from public.web_mvp_private_test_summary summary
  join public_sessions using (session_id)
),
feedback_rollup as (
  select
    count(*)::bigint as total_feedback,
    count(*) filter (where event.metadata ->> 'feedback_category' in ('confusing', 'blocked'))::bigint as friction_feedback,
    jsonb_build_object(
      'setup', count(*) filter (where event.metadata ->> 'feedback_route' = 'setup'),
      'plan', count(*) filter (where event.metadata ->> 'feedback_route' = 'plan'),
      'today', count(*) filter (where event.metadata ->> 'feedback_route' = 'today')
    ) as feedback_by_route,
    jsonb_build_object(
      'smooth', count(*) filter (where event.metadata ->> 'feedback_category' = 'smooth'),
      'confusing', count(*) filter (where event.metadata ->> 'feedback_category' = 'confusing'),
      'blocked', count(*) filter (where event.metadata ->> 'feedback_category' = 'blocked')
    ) as feedback_by_category
  from public.web_mvp_test_events event
  join public_sessions using (session_id)
  where event.event_name = 'pilot_feedback_submitted'
),
source_rollup as (
  select coalesce(jsonb_object_agg(acquisition_source, session_count), '{}'::jsonb) as source_counts
  from (
    select acquisition_source, count(*)::bigint as session_count
    from tester
    group by acquisition_source
  ) source_count
),
stage_rollup as (
  select coalesce(jsonb_object_agg(furthest_stage::text, session_count), '{}'::jsonb) as stage_counts
  from (
    select furthest_stage, count(*)::bigint as session_count
    from tester
    group by furthest_stage
  ) stage_count
),
tester_rollup as (
select
  now() as generated_at,
  count(*)::bigint as total_sessions,
  count(*) filter (where tester.conversation_turns > 0)::bigint as conversation_started,
  count(*) filter (where tester.setup_completed)::bigint as setup_completed,
  count(*) filter (where tester.conversation_turns = 0)::bigint as no_conversation_dropoff,
  count(*) filter (where tester.conversation_turns > 0 and not tester.setup_completed)::bigint as unfinished_after_conversation,
  coalesce(round(100.0 * count(*) filter (where tester.conversation_turns > 0) / nullif(count(*), 0), 1), 0) as conversation_start_rate,
  coalesce(round(100.0 * count(*) filter (where tester.setup_completed) / nullif(count(*), 0), 1), 0) as setup_completion_rate,
  coalesce(round(100.0 * count(*) filter (where tester.setup_completed) / nullif(count(*) filter (where tester.conversation_turns > 0), 0), 1), 0) as completion_after_start_rate,
  count(*) filter (where tester.user_visible_failures > 0)::bigint as sessions_with_failure,
  coalesce(sum(tester.user_visible_failures), 0)::bigint as total_user_visible_failures,
  coalesce(round(avg(tester.conversation_turns)::numeric, 1), 0) as average_conversation_turns,
  round(coalesce(sum(tester.estimated_cost_usd), 0), 6) as total_estimated_cost_usd,
  coalesce(round(sum(tester.estimated_cost_usd) / nullif(count(*) filter (where tester.setup_completed), 0), 6), 0) as cost_per_completed_setup_usd,
  count(*) filter (where tester.returned_next_day is not null)::bigint as eligible_next_day,
  count(*) filter (where tester.returned_next_day)::bigint as returned_next_day,
  coalesce(round(100.0 * count(*) filter (where tester.returned_next_day) / nullif(count(*) filter (where tester.returned_next_day is not null), 0), 1), 0) as next_day_return_rate,
  count(*) filter (where tester.first_week_observation_elapsed)::bigint as eligible_first_week,
  count(*) filter (where tester.first_week_review_applied)::bigint as completed_first_week_review,
  coalesce(round(100.0 * count(*) filter (where tester.first_week_review_applied) / nullif(count(*) filter (where tester.first_week_observation_elapsed), 0), 1), 0) as first_week_review_rate,
  count(*) filter (where tester.last_seen_at >= now() - interval '24 hours')::bigint as active_last_24h,
  count(*) filter (where tester.last_seen_at >= now() - interval '7 days')::bigint as active_last_7d
from tester
)
select
  tester_rollup.*,
  feedback_rollup.total_feedback,
  feedback_rollup.friction_feedback,
  coalesce(round(100.0 * feedback_rollup.friction_feedback / nullif(feedback_rollup.total_feedback, 0), 1), 0) as friction_feedback_rate,
  source_rollup.source_counts,
  stage_rollup.stage_counts,
  feedback_rollup.feedback_by_route,
  feedback_rollup.feedback_by_category
from tester_rollup
cross join feedback_rollup
cross join source_rollup
cross join stage_rollup;

revoke all on table public.web_mvp_public_beta_operations from public, anon, authenticated;
grant select on table public.web_mvp_public_beta_operations to service_role;

comment on view public.web_mvp_public_beta_operations is
  '공개 베타 세션의 유입·대화 시작·설정 완료·오류·비용·피드백·재방문을 원문과 세션 ID 없이 집계한 운영 지표.';

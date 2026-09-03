alter table public.web_mvp_agent_sessions
  add column goal_card jsonb not null default '{}'::jsonb,
  add column goal_response_id text;

comment on column public.web_mvp_agent_sessions.goal_card is
  '목표 설계 에이전트가 만든 숫자 목표·주간 시스템·2분 시작·복귀 규칙.';

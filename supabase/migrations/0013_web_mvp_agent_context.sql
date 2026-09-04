alter table public.web_mvp_agent_sessions
  add column agent_v2_context jsonb not null default '{}'::jsonb,
  add constraint web_mvp_agent_context_is_object check (jsonb_typeof(agent_v2_context) = 'object');

comment on column public.web_mvp_agent_sessions.agent_v2_context is
  '서버 전용 대화 제어 상태. 버전이 있는 미승인 목표 초안이며 goal_card의 확정 목표와 분리한다.';

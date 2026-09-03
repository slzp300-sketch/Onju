alter table public.web_mvp_agent_sessions
  add column agent_v2_response_id text,
  add column agent_v2_events jsonb not null default '[]'::jsonb,
  add column agent_v2_suggestions jsonb not null default '[]'::jsonb,
  add column agent_v2_version smallint not null default 2;

alter table public.web_mvp_agent_sessions
  add constraint web_mvp_agent_v2_events_is_array check (jsonb_typeof(agent_v2_events) = 'array'),
  add constraint web_mvp_agent_v2_suggestions_is_array check (jsonb_typeof(agent_v2_suggestions) = 'array');

alter table public.web_mvp_agent_sessions drop constraint if exists web_mvp_agent_sessions_stage_check;
alter table public.web_mvp_agent_sessions
  add constraint web_mvp_agent_sessions_stage_check check (stage between 0 and 5);

comment on column public.web_mvp_agent_sessions.agent_v2_response_id is
  '대화 문맥 전용 Responses API 식별자. 일정·목표 사실 데이터와 분리한다.';
comment on column public.web_mvp_agent_sessions.agent_v2_events is
  '검증을 통과해 실행된 에이전트 도구의 감사 로그.';

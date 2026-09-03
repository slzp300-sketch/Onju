alter table public.web_mvp_agent_sessions
  add column pending_plan jsonb not null default '[]'::jsonb,
  add column plan_revision_history jsonb not null default '[]'::jsonb,
  add column plan_revision_response_id text;

alter table public.web_mvp_agent_sessions
  add constraint web_mvp_pending_plan_is_array check (jsonb_typeof(pending_plan) = 'array'),
  add constraint web_mvp_plan_revision_history_is_array check (jsonb_typeof(plan_revision_history) = 'array');

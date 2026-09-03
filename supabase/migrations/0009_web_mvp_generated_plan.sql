alter table public.web_mvp_agent_sessions
  add column generated_plan jsonb not null default '[]'::jsonb,
  add column plan_response_id text;

alter table public.web_mvp_agent_sessions
  add constraint web_mvp_generated_plan_is_array check (jsonb_typeof(generated_plan) = 'array');

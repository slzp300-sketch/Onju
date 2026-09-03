alter table public.web_mvp_agent_sessions
  add column day_bounds jsonb not null default '[]'::jsonb;

alter table public.web_mvp_agent_sessions
  add constraint web_mvp_day_bounds_is_array check (jsonb_typeof(day_bounds) = 'array');

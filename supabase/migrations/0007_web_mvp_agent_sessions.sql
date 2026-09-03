-- 웹 MVP 익명 에이전트 세션. 클라이언트 직접 접근은 차단하고 Edge Function만 service role로 접근한다.
create table public.web_mvp_agent_sessions (
  session_id uuid primary key,
  stage smallint not null default 0 check (stage between 0 and 4),
  messages jsonb not null default '[]'::jsonb,
  blocks jsonb not null default '[]'::jsonb,
  pending_blocks jsonb not null default '[]'::jsonb,
  goal text not null default '',
  reason text not null default '',
  obstacle text not null default '',
  openai_response_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  check (jsonb_typeof(messages) = 'array'),
  check (jsonb_typeof(blocks) = 'array'),
  check (jsonb_typeof(pending_blocks) = 'array')
);

create index web_mvp_agent_sessions_expires_idx
  on public.web_mvp_agent_sessions (expires_at);

alter table public.web_mvp_agent_sessions enable row level security;

comment on table public.web_mvp_agent_sessions is
  '온주 웹 MVP의 30일 익명 대화 세션. RLS 정책 없이 service role Edge Function만 접근.';

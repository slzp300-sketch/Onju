-- 사용자가 명시적으로 동의한 경우에만 최근 대화 일부를 별도 진단 자료로 보관한다.
create table public.web_mvp_diagnostic_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.web_mvp_agent_sessions(session_id) on delete cascade,
  feedback_message_id uuid not null,
  route text not null check (route in ('setup', 'plan', 'today')),
  category text not null check (category in ('confusing', 'blocked')),
  comment text not null default '' check (char_length(comment) <= 180),
  messages jsonb not null,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  unique (session_id, feedback_message_id),
  check (jsonb_typeof(messages) = 'array' and jsonb_array_length(messages) between 1 and 6),
  check (jsonb_typeof(state) = 'object')
);

create index web_mvp_diagnostic_reports_expires_idx on public.web_mvp_diagnostic_reports (expires_at);
create index web_mvp_diagnostic_reports_session_idx on public.web_mvp_diagnostic_reports (session_id, created_at desc);

alter table public.web_mvp_diagnostic_reports enable row level security;
revoke all on table public.web_mvp_diagnostic_reports from public, anon, authenticated;
grant select, insert, update, delete on table public.web_mvp_diagnostic_reports to service_role;

comment on table public.web_mvp_diagnostic_reports is
  '사용자가 피드백 화면에서 별도 동의한 최근 대화 최대 6개와 최소 진행 상태. service role만 접근하며 30일 후 삭제.';

-- 기존 만료 정리 작업에서 진단 자료도 독립적으로 30일 경계를 지킨다.
create or replace function public.web_mvp_cleanup_expired_sessions(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.web_mvp_diagnostic_reports report
  where report.id in (
    select id
    from public.web_mvp_diagnostic_reports
    where expires_at < now()
    order by expires_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  );

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
  is '만료된 동의형 진단 자료와 익명 웹 MVP 세션 및 cascade 연결 데이터를 최대 500개씩 정리한다.';

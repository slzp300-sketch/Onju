-- 동의형 진단 자료를 자동 학습하지 않고, 사람의 2단계 검토를 거쳐
-- 회귀 평가 후보로 다루기 위한 service-role 전용 큐다.

create table public.web_mvp_learning_reviews (
  id uuid primary key default gen_random_uuid(),
  diagnostic_report_id uuid not null unique
    references public.web_mvp_diagnostic_reports(id) on delete cascade,
  route text not null check (route in ('setup', 'plan', 'today')),
  category text not null check (category in ('confusing', 'blocked')),
  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'promoted', 'dismissed')),
  failure_type text check (failure_type in (
    'understanding', 'repetition', 'state', 'planning', 'tool', 'ui', 'safety', 'other'
  )),
  rule_groups text[] not null default '{}',
  evaluation_dimensions text[] not null default '{}',
  first_reviewed_at timestamptz,
  second_reviewed_at timestamptz,
  promoted_case_name text check (char_length(promoted_case_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status = 'pending'
    or status = 'dismissed'
    or (
      failure_type is not null
      and cardinality(rule_groups) > 0
      and cardinality(evaluation_dimensions) > 0
      and first_reviewed_at is not null
    )
  ),
  check (
    status <> 'promoted'
    or (second_reviewed_at is not null and nullif(btrim(promoted_case_name), '') is not null)
  )
);

create index web_mvp_learning_reviews_status_created_idx
  on public.web_mvp_learning_reviews (status, created_at);

alter table public.web_mvp_learning_reviews enable row level security;
revoke all on table public.web_mvp_learning_reviews from public, anon, authenticated;
grant select, insert, update, delete on table public.web_mvp_learning_reviews to service_role;

comment on table public.web_mvp_learning_reviews is
  '동의형 진단 자료의 검토 상태와 규칙 분류만 보관하는 30일 이내 큐. 대화·의견 원문은 복제하지 않는다.';

create or replace function public.web_mvp_enqueue_learning_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.web_mvp_learning_reviews (
    diagnostic_report_id, route, category, created_at, updated_at
  ) values (
    new.id, new.route, new.category, new.created_at, new.created_at
  )
  on conflict (diagnostic_report_id) do nothing;
  return new;
end;
$$;

revoke all on function public.web_mvp_enqueue_learning_review() from public, anon, authenticated;
grant execute on function public.web_mvp_enqueue_learning_review() to service_role;

create trigger web_mvp_diagnostic_learning_review_trigger
after insert on public.web_mvp_diagnostic_reports
for each row execute function public.web_mvp_enqueue_learning_review();

-- 기존 동의형 진단 자료도 배포 시 한 번만 큐에 편입한다.
insert into public.web_mvp_learning_reviews (
  diagnostic_report_id, route, category, created_at, updated_at
)
select report.id, report.route, report.category, report.created_at, report.created_at
from public.web_mvp_diagnostic_reports report
on conflict (diagnostic_report_id) do nothing;

create view public.web_mvp_learning_queue_summary
with (security_invoker = true)
as
select
  status,
  route,
  category,
  coalesce(failure_type, 'unclassified') as failure_type,
  count(*)::bigint as review_count,
  min(created_at) as oldest_created_at,
  max(created_at) as newest_created_at
from public.web_mvp_learning_reviews
group by status, route, category, coalesce(failure_type, 'unclassified');

revoke all on table public.web_mvp_learning_queue_summary from public, anon, authenticated;
grant select on table public.web_mvp_learning_queue_summary to service_role;

comment on view public.web_mvp_learning_queue_summary is
  '식별자와 원문 없이 검토 대기·분류·승격 현황만 보여주는 운영 집계.';

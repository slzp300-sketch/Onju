-- 주간 실행 결과를 사용자와 대화로 회고하고, 승인된 조정의 다음 주 효과를 검증한다.
-- 세션 소유권은 기존 익명 Web MVP 세션으로 제한하며 클라이언트 직접 접근은 허용하지 않는다.

create table public.web_mvp_weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.web_mvp_agent_sessions(session_id) on delete cascade,
  week_start date not null,
  week_end date not null check (week_end >= week_start),
  next_week_start date not null,
  next_week_end date not null check (next_week_end >= next_week_start),
  status text not null default 'active' check (status in ('active', 'ready', 'applied', 'dismissed')),
  revision integer not null default 0 check (revision >= 0),
  evidence_signature text not null check (char_length(evidence_signature) between 1 and 2000),
  baseline jsonb not null default '{}'::jsonb check (jsonb_typeof(baseline) = 'object'),
  plan_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(plan_snapshot) = 'array'),
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  recommendation jsonb not null default '{}'::jsonb check (jsonb_typeof(recommendation) = 'object'),
  applied_plan jsonb not null default '[]'::jsonb check (jsonb_typeof(applied_plan) = 'array'),
  evaluation jsonb not null default '{}'::jsonb check (jsonb_typeof(evaluation) = 'object'),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, week_end)
);

create index web_mvp_weekly_reviews_session_week_idx
  on public.web_mvp_weekly_reviews (session_id, week_end desc);

alter table public.web_mvp_weekly_reviews enable row level security;

create or replace function public.web_mvp_apply_weekly_review(
  p_review_id uuid,
  p_session_id uuid,
  p_revision integer,
  p_evidence_signature text,
  p_plan jsonb,
  p_client_plan jsonb,
  p_applied_on date
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_review public.web_mvp_weekly_reviews%rowtype;
begin
  if jsonb_typeof(p_plan) <> 'array' or jsonb_array_length(p_plan) > 28
    or jsonb_typeof(p_client_plan) <> 'array' or jsonb_array_length(p_client_plan) > 28 then
    raise exception 'invalid_plan';
  end if;

  select * into current_review
  from public.web_mvp_weekly_reviews
  where id = p_review_id and session_id = p_session_id
  for update;

  if not found then
    return false;
  end if;

  if current_review.status <> 'ready'
    or current_review.revision <> p_revision
    or current_review.evidence_signature <> p_evidence_signature then
    return false;
  end if;

  perform public.web_mvp_sync_routine_plan(p_session_id, p_plan, p_applied_on);

  update public.web_mvp_agent_sessions
  set generated_plan = p_client_plan,
      pending_plan = '[]'::jsonb,
      updated_at = now()
  where session_id = p_session_id;

  update public.web_mvp_weekly_reviews
  set status = 'applied',
      applied_plan = p_plan,
      approved_at = now(),
      revision = revision + 1,
      updated_at = now()
  where id = p_review_id;

  return true;
end;
$$;

revoke all on function public.web_mvp_apply_weekly_review(uuid, uuid, integer, text, jsonb, jsonb, date)
  from public, anon, authenticated;
grant execute on function public.web_mvp_apply_weekly_review(uuid, uuid, integer, text, jsonb, jsonb, date)
  to service_role;

comment on table public.web_mvp_weekly_reviews is '온주 Web MVP의 주간 회고 대화, 승인된 다음 주 조정, 후속 효과 검증 기록.';
comment on column public.web_mvp_weekly_reviews.baseline is '회고를 시작한 시점의 루틴별 주간 실행 지표.';
comment on column public.web_mvp_weekly_reviews.evaluation is '승인한 조정 이후 다음 주의 실행률·연속성 변화와 검증 판정.';

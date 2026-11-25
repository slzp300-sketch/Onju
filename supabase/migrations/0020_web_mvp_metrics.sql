-- 국가·언어·모델별 AI 원가와 핵심 제품 전환을 개인정보 없이 측정한다.
-- 두 테이블 모두 클라이언트 직접 접근을 허용하지 않고 service role Edge Function만 기록한다.

create table public.web_mvp_ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.web_mvp_agent_sessions(session_id) on delete cascade,
  source_id text not null check (char_length(source_id) between 1 and 160),
  turn_id uuid,
  call_index smallint not null check (call_index between 0 and 31),
  surface text not null check (surface ~ '^[a-z][a-z0-9_]{1,39}$'),
  operation text not null check (operation ~ '^[a-z][a-z0-9_]{1,59}$'),
  provider text not null check (provider in ('openai', 'google', 'anthropic', 'local', 'unknown')),
  model text not null check (char_length(model) between 1 and 120),
  locale text not null check (locale ~ '^[A-Za-z0-9-]{2,35}$'),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0 and cached_input_tokens <= input_tokens),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  retries smallint not null default 0 check (retries between 0 and 10),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  tool_calls smallint not null default 0 check (tool_calls between 0 and 10),
  estimated_cost_usd_micros bigint check (estimated_cost_usd_micros is null or estimated_cost_usd_micros >= 0),
  pricing_version text check (pricing_version is null or char_length(pricing_version) between 1 and 80),
  cost_status text not null check (cost_status in ('estimated', 'partial', 'unpriced')),
  response_id text check (response_id is null or char_length(response_id) between 1 and 160),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (session_id, source_id, call_index)
);

create index web_mvp_ai_usage_events_occurred_idx
  on public.web_mvp_ai_usage_events (occurred_at desc);
create index web_mvp_ai_usage_events_segment_idx
  on public.web_mvp_ai_usage_events (country_code, locale, provider, model, occurred_at desc);
create index web_mvp_ai_usage_events_session_idx
  on public.web_mvp_ai_usage_events (session_id, occurred_at desc);

alter table public.web_mvp_ai_usage_events enable row level security;
revoke all on table public.web_mvp_ai_usage_events from anon, authenticated;

comment on table public.web_mvp_ai_usage_events is
  'AI 호출별 토큰·지연·재시도·추정 원가 원장. 미확인 가격은 0원이 아닌 unpriced/null로 기록한다.';
comment on column public.web_mvp_ai_usage_events.estimated_cost_usd_micros is
  'USD 1달러의 백만분의 1 단위 추정값. 공급자 청구서와 차이가 날 수 있다.';

create table public.web_mvp_product_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.web_mvp_agent_sessions(session_id) on delete cascade,
  source_id text not null check (char_length(source_id) between 1 and 160),
  turn_id uuid,
  event_name text not null check (event_name ~ '^[a-z][a-z0-9_]{1,59}$'),
  surface text not null check (surface ~ '^[a-z][a-z0-9_]{1,39}$'),
  locale text not null check (locale ~ '^[A-Za-z0-9-]{2,35}$'),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  experiment_key text check (experiment_key is null or char_length(experiment_key) between 1 and 80),
  experiment_variant text check (experiment_variant is null or char_length(experiment_variant) between 1 and 80),
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object' and octet_length(properties::text) <= 2048),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (session_id, event_name, source_id)
);

create index web_mvp_product_events_occurred_idx
  on public.web_mvp_product_events (event_name, occurred_at desc);
create index web_mvp_product_events_segment_idx
  on public.web_mvp_product_events (country_code, locale, event_name, occurred_at desc);
create index web_mvp_product_events_session_idx
  on public.web_mvp_product_events (session_id, occurred_at desc);

alter table public.web_mvp_product_events enable row level security;
revoke all on table public.web_mvp_product_events from anon, authenticated;

comment on table public.web_mvp_product_events is
  '목표 시작→초안→확정→계획→첫 실행→점검의 전환 이벤트. 원문 대화와 개인 식별 정보는 저장하지 않는다.';

create view public.web_mvp_ai_cost_daily
with (security_invoker = true)
as
select
  date_trunc('day', occurred_at) as usage_day,
  country_code,
  locale,
  currency_code,
  provider,
  model,
  surface,
  operation,
  count(*) as call_count,
  count(distinct session_id) as session_count,
  sum(input_tokens) as input_tokens,
  sum(cached_input_tokens) as cached_input_tokens,
  sum(output_tokens) as output_tokens,
  sum(retries) as retry_count,
  round(avg(latency_ms)) as average_latency_ms,
  sum(estimated_cost_usd_micros) as estimated_cost_usd_micros,
  count(*) filter (where cost_status = 'partial') as partial_cost_calls,
  count(*) filter (where cost_status = 'unpriced') as unpriced_calls
from public.web_mvp_ai_usage_events
group by 1, 2, 3, 4, 5, 6, 7, 8;

create view public.web_mvp_funnel_daily
with (security_invoker = true)
as
select
  date_trunc('day', occurred_at) as event_day,
  country_code,
  locale,
  currency_code,
  surface,
  event_name,
  count(*) as event_count,
  count(distinct session_id) as session_count
from public.web_mvp_product_events
group by 1, 2, 3, 4, 5, 6;

revoke all on table public.web_mvp_ai_cost_daily from anon, authenticated;
revoke all on table public.web_mvp_funnel_daily from anon, authenticated;

comment on view public.web_mvp_ai_cost_daily is
  'UTC 일자·국가·언어·모델별 AI 원가와 미산정 호출을 함께 보는 운영 집계.';
comment on view public.web_mvp_funnel_daily is
  'UTC 일자·국가·언어별 목표 설계와 실행 전환 집계.';

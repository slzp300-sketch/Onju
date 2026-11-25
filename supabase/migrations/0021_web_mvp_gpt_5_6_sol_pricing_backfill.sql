-- GPT-5.6 Sol의 공식 프로모션 가격을 가격표 등록 전 수집된 원장에도 반영한다.
-- USD 1달러의 백만분의 1 단위이므로 토큰 수 × 100만 토큰당 USD가 micro-USD 값이다.
update public.web_mvp_ai_usage_events
set
  estimated_cost_usd_micros = round(
    (input_tokens - cached_input_tokens) * 4.0
    + cached_input_tokens * 0.4
    + output_tokens * 20.0
  )::bigint,
  pricing_version = 'openai-gpt-5.6-sol-promo-2026-09-15',
  cost_status = case when tool_calls > 0 then 'partial' else 'estimated' end
where provider = 'openai'
  and (model = 'gpt-5.6-sol' or model ~ '^gpt-5\.6-sol-')
  and cost_status = 'unpriced';

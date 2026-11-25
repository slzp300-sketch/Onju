-- 하루 조정안에 대한 사용자의 선택 이유와 수정 내용을 남겨 실제 효과를 측정한다.

alter table public.web_mvp_daily_adaptations
  add column decision_mode text not null default 'pending'
    check (decision_mode in ('pending', 'accepted', 'modified', 'dismissed')),
  add column decision_reason text not null default ''
    check (char_length(decision_reason) <= 40),
  add column decision_note text not null default ''
    check (char_length(decision_note) <= 240),
  add column selected_action text not null default ''
    check (char_length(selected_action) <= 240),
  add column decided_at timestamptz;

update public.web_mvp_daily_adaptations
set decision_mode = case status
  when 'applied' then 'accepted'
  when 'dismissed' then 'dismissed'
  else 'pending'
end,
decision_reason = case status
  when 'applied' then 'accepted'
  when 'dismissed' then 'prefer_current'
  else ''
end,
selected_action = case
  when status = 'applied' then coalesce(recommendation->>'nextAction', '')
  else ''
end,
decided_at = case when status in ('applied', 'dismissed') then updated_at else null end;

comment on column public.web_mvp_daily_adaptations.decision_mode is '제안을 그대로 적용, 수정 적용, 유지 중 어떤 선택을 했는지 기록.';
comment on column public.web_mvp_daily_adaptations.decision_reason is '사용자 선택의 짧은 분류값. 조정 품질 분석에 사용.';
comment on column public.web_mvp_daily_adaptations.selected_action is '사용자가 실제로 승인한 다음 실행 행동. 수정 적용 시 원안과 분리해 보존.';

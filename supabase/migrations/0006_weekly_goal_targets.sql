-- ============================================================
-- 주간 목표 재설계: "이번 주 몇 번" — 횟수 기반 실행 목표
-- 습관·루틴 1개를 연동하고, 진행률은 체크 로그에서 자동 계산한다.
-- completion_rate는 주간 리뷰 완료 시점에 확정 기록 (이력·슬롯 판정 근거).
-- ============================================================
alter table public.weekly_goals
  add column target_count int not null default 3 check (target_count between 1 and 7),
  add column linked_kind text check (linked_kind in ('habit', 'routine')),
  add column linked_id uuid,
  add column emoji text;

-- 주간 리뷰도 홈의 Habit + PersonalRoutine 구조를 사용한다. 기존 리뷰는 보존한다.
alter table public.weekly_reviews
  add column if not exists habit_changes jsonb not null default '[]'::jsonb,
  add column if not exists changes_applied_at timestamptz;
alter table public.weekly_reviews
  add constraint weekly_reviews_habit_changes_array check (jsonb_typeof(habit_changes) = 'array');

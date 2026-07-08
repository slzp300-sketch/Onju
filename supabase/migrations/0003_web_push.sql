-- 웹 Push 지원: 브라우저 구독 정보 + 클라이언트가 계산한 알림 스케줄
-- Edge Function(send-reminders)이 reminder_schedule을 매분 조회해 push_subscriptions로 발송한다.

-- ── 브라우저 푸시 구독 ──
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── 알림 스케줄 (클라이언트가 계산한 spec을 전체 교체 저장) ──
-- weekdays: 1=일 ~ 7=토 배열. null이면 매일. 시각은 KST(Asia/Seoul) 기준.
create table if not exists public.reminder_schedule (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  key       text not null,
  title     text not null,
  body      text not null,
  hour      smallint not null check (hour between 0 and 23),
  minute    smallint not null check (minute between 0 and 59),
  weekdays  smallint[],
  unique (user_id, key)
);

create index if not exists reminder_schedule_time_idx on public.reminder_schedule(hour, minute);

alter table public.reminder_schedule enable row level security;

drop policy if exists "own reminder schedule" on public.reminder_schedule;
create policy "own reminder schedule" on public.reminder_schedule
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

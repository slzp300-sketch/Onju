-- 국가별 출시를 위해 익명 세션의 표시 언어·시간대·통화 기준을 명시적으로 저장한다.
alter table public.web_mvp_agent_sessions
  add column if not exists locale text not null default 'ko-KR',
  add column if not exists country_code text not null default 'KR',
  add column if not exists time_zone text not null default 'Asia/Seoul',
  add column if not exists currency_code text not null default 'KRW',
  add column if not exists week_starts_on smallint not null default 1;

alter table public.web_mvp_agent_sessions
  add constraint web_mvp_agent_sessions_locale_check
    check (locale ~ '^[A-Za-z0-9-]{2,35}$'),
  add constraint web_mvp_agent_sessions_country_code_check
    check (country_code ~ '^[A-Z]{2}$'),
  add constraint web_mvp_agent_sessions_time_zone_check
    check (char_length(time_zone) between 3 and 80),
  add constraint web_mvp_agent_sessions_currency_code_check
    check (currency_code ~ '^[A-Z]{3}$'),
  add constraint web_mvp_agent_sessions_week_starts_on_check
    check (week_starts_on in (0, 1));

alter table public.web_mvp_checkin_preferences
  drop constraint if exists web_mvp_checkin_preferences_timezone_check;

alter table public.web_mvp_daily_logs
  drop constraint if exists web_mvp_daily_logs_timezone_check;

comment on column public.web_mvp_agent_sessions.locale is '사용자에게 표시할 BCP 47 언어 태그.';
comment on column public.web_mvp_agent_sessions.country_code is '가격·규정·검색 지역 판단용 ISO 3166-1 alpha-2 국가 코드.';
comment on column public.web_mvp_agent_sessions.time_zone is '일정과 오늘 날짜 계산에 사용하는 IANA 시간대.';
comment on column public.web_mvp_agent_sessions.currency_code is '가격 표시에 사용하는 ISO 4217 통화 코드.';
comment on column public.web_mvp_agent_sessions.week_starts_on is '주 시작 요일. 0=일요일, 1=월요일.';


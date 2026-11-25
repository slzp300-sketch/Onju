-- Additive integration for the separate site lineage. Do not renumber 0019.
-- Existing dates/timezones are deliberately not backfilled or reinterpreted.
alter table public.web_mvp_agent_sessions
  add column if not exists locale text not null default 'ko-KR',
  add column if not exists country_code text not null default 'KR',
  add column if not exists time_zone text not null default 'Asia/Seoul',
  add column if not exists currency_code text not null default 'KRW',
  add column if not exists week_starts_on smallint not null default 1;

alter table public.web_mvp_checkin_preferences
  drop constraint if exists web_mvp_checkin_preferences_timezone_check;
alter table public.web_mvp_daily_logs
  drop constraint if exists web_mvp_daily_logs_timezone_check;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='web_mvp_regional_values_check' and conrelid='public.web_mvp_agent_sessions'::regclass) then
    alter table public.web_mvp_agent_sessions add constraint web_mvp_regional_values_check check (
      locale ~ '^[A-Za-z0-9-]{2,35}$'
      and country_code ~ '^[A-Z]{2}$'
      and currency_code ~ '^[A-Z]{3}$'
      and char_length(time_zone) between 3 and 80
      and week_starts_on in (0,1)
    );
  end if;
end $$;

comment on column public.web_mvp_agent_sessions.country_code is 'User-selected country. ZZ means not specified; never infer residence from browser language.';
comment on column public.web_mvp_agent_sessions.currency_code is 'Display currency only. XXX means unspecified; not evidence of payment support.';
comment on column public.web_mvp_agent_sessions.week_starts_on is 'Display week start: 0=Sunday, 1=Monday. Stored routine day indices remain Monday=0.';
comment on column public.web_mvp_daily_logs.timezone is 'Time zone when this calendar-date record was first created. Historical rows keep their existing values.';

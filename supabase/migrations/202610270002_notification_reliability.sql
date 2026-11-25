-- 로컬 검증용. 운영 적용은 기능 검증 후 별도 배포 단계에서 수행한다.
alter table public.reminder_schedule add column if not exists timezone text not null default 'Asia/Seoul';
alter table public.reminder_schedule add column if not exists last_sent_at timestamptz;

create or replace function public.replace_reminder_schedule(p_specs jsonb, p_timezone text)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_specs) is distinct from 'array' or jsonb_array_length(p_specs) > 1000 then
    raise exception 'invalid reminder list';
  end if;
  if not exists(select 1 from pg_timezone_names where name = p_timezone) then raise exception 'invalid timezone'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  if exists(select 1 from jsonb_to_recordset(p_specs) as s(weekdays smallint[])
    where weekdays is not null and (cardinality(weekdays) = 0 or not weekdays <@ array[1,2,3,4,5,6,7]::smallint[] or array_position(weekdays, null) is not null)) then
    raise exception 'invalid weekdays';
  end if;
  insert into public.reminder_schedule(user_id,key,title,body,hour,minute,weekdays,timezone)
    select owner_id,s.key,s.title,s.body,s.hour,s.minute,s.weekdays,p_timezone
    from jsonb_to_recordset(p_specs) as s(key text,title text,body text,hour smallint,minute smallint,weekdays smallint[])
    on conflict(user_id,key) do update set title=excluded.title,body=excluded.body,hour=excluded.hour,
      minute=excluded.minute,weekdays=excluded.weekdays,timezone=excluded.timezone;
  delete from public.reminder_schedule r where r.user_id=owner_id
    and not exists(select 1 from jsonb_array_elements(p_specs) s where s->>'key'=r.key);
end;
$$;
revoke all on function public.replace_reminder_schedule(jsonb,text) from public, anon;
grant execute on function public.replace_reminder_schedule(jsonb,text) to authenticated;

-- 같은 분의 중복 호출은 한 번만 선점한다. 지난 분의 알림은 따라 보내지 않는다.
create or replace function public.claim_due_reminders()
returns setof public.reminder_schedule language sql security invoker set search_path = public, pg_temp as $$
  update public.reminder_schedule r set last_sent_at=now()
  where r.hour=extract(hour from now() at time zone r.timezone)
    and r.minute=extract(minute from now() at time zone r.timezone)
    and (r.weekdays is null or (extract(dow from now() at time zone r.timezone)::int+1)=any(r.weekdays))
    and (r.last_sent_at is null or r.last_sent_at < date_trunc('minute',now()))
  returning r.*;
$$;
revoke all on function public.claim_due_reminders() from public, anon, authenticated;
grant execute on function public.claim_due_reminders() to service_role;

-- Local preparation only. Apply with the mobile release after verification.
alter table public.habits add column archived_at date;
alter table public.habits add column schedule_history jsonb not null default '[]' check (jsonb_typeof(schedule_history) = 'array');
alter table public.daily_routines add column archived_at date;
alter table public.daily_routines add column schedule_history jsonb not null default '[]' check (jsonb_typeof(schedule_history) = 'array');

-- The client sends the first baseline with its first change. Existing rows keep their
-- current rule until then; changes made before this migration cannot be reconstructed.
create function public.item_due_on(item jsonb, day date, zone text)
returns boolean language plpgsql immutable set search_path = public as $$
declare rule jsonb; custom int[];
begin
  if (item->>'created_at')::timestamptz at time zone zone > day + interval '1 day' - interval '1 microsecond' then return false; end if;
  if jsonb_array_length(coalesce(item->'schedule_history','[]')) > 0 then
    select r into rule from jsonb_array_elements(item->'schedule_history') r
      where r->>'from' <= day::text order by r->>'from' desc limit 1;
    if rule is null or not coalesce((rule->>'active')::boolean,false) then return false; end if;
    select array_agg(v::int) into custom from jsonb_array_elements_text(coalesce(rule->'customDays','[]')) v;
    return public.is_scheduled(rule->'frequency',custom,day);
  end if;
  if item->>'archived_at' is not null or not coalesce((item->>'is_active')::boolean,true) then return false; end if;
  select array_agg(v::int) into custom from jsonb_array_elements_text(case when jsonb_typeof(item->'custom_days')='array' then item->'custom_days' else '[]' end) v;
  return public.is_scheduled(item->'frequency',custom,day);
end;
$$;
revoke all on function public.item_due_on(jsonb,date,text) from public, anon, authenticated;

create function public.get_group_member_progress_v2(gid uuid, p_timezone text default null, p_week_start int default null)
returns table(user_id uuid, user_name text, profile_image text, today_personal_rate int, today_faith_rate int, weekly_rate int, streak int)
language plpgsql security definer set search_path = public stable as $$
declare m record; counts record; zone text; first_day int; local_today date; week_start date;
  rate int; sum_rates int; week_days int; broken boolean;
begin
  if not public.is_group_member(gid) then raise exception '소모임 멤버만 볼 수 있어요'; end if;
  if p_timezone is not null and not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception '시간대를 확인해주세요'; end if;
  if p_week_start is not null and p_week_start not in (0,1) then raise exception '주 시작 요일을 확인해주세요'; end if;
  for m in select gm.user_id as uid,p.name,p.profile_image as img,coalesce(s.settings,'{}') as prefs
    from group_members gm join profiles p on p.id=gm.user_id left join user_settings s on s.user_id=gm.user_id
    where gm.group_id=gid and not public.is_community_blocked(gm.user_id)
  loop
    zone := case when m.uid=auth.uid() and p_timezone is not null then p_timezone else m.prefs->>'timeZone' end;
    if zone is null or not exists(select 1 from pg_timezone_names where name=zone) then zone := 'Asia/Seoul'; end if;
    first_day := case when m.uid=auth.uid() and p_week_start is not null then p_week_start when m.prefs->>'weekStartDay'='0' then 0 else 1 end;
    local_today := (now() at time zone zone)::date;
    week_start := local_today - ((extract(dow from local_today)::int-first_day+7)%7);
    user_id := m.uid; user_name := m.name; profile_image := m.img;
    today_personal_rate := -1; today_faith_rate := -1; sum_rates := 0; week_days := 0; streak := 0; broken := false;
    for counts in
      with days as (select local_today-i as day from generate_series(0,364) i),
      scheduled as (
        select d.day,'personal' as kind,exists(select 1 from habit_logs l where l.user_id=m.uid and l.habit_id=h.id and l.date=d.day and (l.completed or l.skipped or l.substitute)) as done
        from days d cross join habits h where h.user_id=m.uid and public.item_due_on(to_jsonb(h),d.day,zone)
        union all
        select d.day,'faith',exists(select 1 from routine_logs l where l.user_id=m.uid and l.routine_id=r.id and l.date=d.day and (l.completed or l.skipped))
        from days d cross join daily_routines r where r.user_id=m.uid and r.type='faith' and public.item_due_on(to_jsonb(r),d.day,zone)
      )
      select day,count(*) as total,count(*) filter(where done) as done,
        count(*) filter(where kind='personal') as pt,count(*) filter(where kind='personal' and done) as pd,
        count(*) filter(where kind='faith') as ft,count(*) filter(where kind='faith' and done) as fd
      from scheduled group by day order by day desc
    loop
      rate := round(counts.done*100.0/counts.total);
      if counts.day=local_today then
        today_personal_rate := case when counts.pt=0 then -1 else round(counts.pd*100.0/counts.pt) end;
        today_faith_rate := case when counts.ft=0 then -1 else round(counts.fd*100.0/counts.ft) end;
      end if;
      if counts.day>=week_start then sum_rates := sum_rates+rate; week_days := week_days+1; end if;
      if not broken then
        if rate>=50 then streak := streak+1;
        elsif counts.day<>local_today then broken := true; end if;
      end if;
    end loop;
    weekly_rate := case when week_days=0 then 0 else round(sum_rates::numeric/week_days) end;
    return next;
  end loop;
end;
$$;
revoke all on function public.get_group_member_progress_v2(uuid,text,int) from public, anon;
grant execute on function public.get_group_member_progress_v2(uuid,text,int) to authenticated;
-- Existing callers receive the same definition using saved member settings.
create or replace function public.get_group_member_progress(gid uuid)
returns table(user_id uuid,user_name text,profile_image text,today_personal_rate int,today_faith_rate int,weekly_rate int,streak int)
language sql security definer set search_path=public stable
as $$ select * from public.get_group_member_progress_v2(gid); $$;

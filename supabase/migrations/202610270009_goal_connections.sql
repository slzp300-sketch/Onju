-- Local preparation only. No habit/routine/log is deleted with a monthly goal.
create function public.detached_goal_history(item jsonb, effective_date date, zone text)
returns jsonb language plpgsql stable set search_path=public as $$
declare history jsonb := coalesce(item->'schedule_history','[]'); rule jsonb; previous jsonb; following jsonb; at_date jsonb;
begin
  rule := jsonb_strip_nulls(jsonb_build_object(
    'from',effective_date::text,'title',item->'title','emoji',item->'emoji',
    'frequency',item->'frequency','customDays',item->'custom_days',
    'active',item->>'archived_at' is null and coalesce((item->>'is_active')::boolean,true)));
  if jsonb_array_length(history)=0 then
    history := jsonb_build_array(rule || jsonb_build_object(
      'from',((item->>'created_at')::timestamptz at time zone zone)::date::text,'goalId',item->'goal_id'));
  end if;
  select coalesce(jsonb_agg(r order by r->>'from'),'[]') into previous
    from jsonb_array_elements(history) r where r->>'from' < effective_date::text;
  select r into at_date from jsonb_array_elements(history) r
    where r->>'from' <= effective_date::text order by r->>'from' desc limit 1;
  at_date := coalesce(at_date,rule) || jsonb_build_object('from',effective_date::text);
  if at_date->>'goalId' = item->>'goal_id' then at_date := at_date - 'goalId'; end if;
  -- An offline deletion may arrive after later schedule changes on another device.
  -- Keep those revisions and their unrelated goal links; remove only this goal.
  select coalesce(jsonb_agg(case when r->>'goalId'=item->>'goal_id' then r-'goalId' else r end order by r->>'from'),'[]') into following
    from jsonb_array_elements(history) r where r->>'from' > effective_date::text;
  return previous || jsonb_build_array(at_date) || following;
end;
$$;
revoke all on function public.detached_goal_history(jsonb,date,text) from public,anon,authenticated;

-- The trigger also handles old queued DELETE operations. Cleanup rolls back with deletion.
create function public.clean_deleted_goal_connections()
returns trigger language plpgsql security definer set search_path=public as $$
declare zone text := nullif(current_setting('onju.goal_delete_zone',true),'');
  effective_date date := nullif(current_setting('onju.goal_delete_date',true),'')::date;
begin
  zone := coalesce(zone,'Asia/Seoul');
  effective_date := coalesce(effective_date,(now() at time zone zone)::date);
  update habits h set schedule_history=public.detached_goal_history(to_jsonb(h),effective_date,zone),goal_id=null
    where h.user_id=old.user_id and h.goal_id=old.id;
  update daily_routines r set schedule_history=public.detached_goal_history(to_jsonb(r),effective_date,zone),goal_id=null
    where r.user_id=old.user_id and r.goal_id=old.id;
  update daily_routines set monthly_goal_id=null where user_id=old.user_id and monthly_goal_id=old.id;
  update weekly_goals set monthly_goal_id=null where user_id=old.user_id and monthly_goal_id=old.id;
  return old;
end;
$$;
revoke all on function public.clean_deleted_goal_connections() from public,anon,authenticated;
create trigger clean_deleted_goal_connections before delete on public.monthly_goals
  for each row execute function public.clean_deleted_goal_connections();

create function public.delete_monthly_goal_preserving_history(gid uuid, effective_date date, p_timezone text default 'Asia/Seoul')
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if effective_date is null or p_timezone is null or not exists(select 1 from pg_timezone_names where name=p_timezone) then
    raise exception '적용 날짜와 시간대를 확인해주세요';
  end if;
  if effective_date > (now() at time zone p_timezone)::date then raise exception '미래 날짜로 삭제할 수 없어요'; end if;
  -- Only the caller's goal is locked/deleted. A lost response is safe to retry.
  perform 1 from monthly_goals where id=gid and user_id=auth.uid() for update;
  if not found then return; end if;
  perform set_config('onju.goal_delete_date',effective_date::text,true);
  perform set_config('onju.goal_delete_zone',p_timezone,true);
  delete from monthly_goals where id=gid and user_id=auth.uid();
end;
$$;
revoke all on function public.delete_monthly_goal_preserving_history(uuid,date,text) from public,anon;
grant execute on function public.delete_monthly_goal_preserving_history(uuid,date,text) to authenticated;

-- A stale device can still send an old full-row upsert after deletion. Keep its
-- content/logs, but never reintroduce a dangling current goal link. Key-share locks
-- serialize a valid reference with a concurrent goal deletion (deadlocks retry).
create function public.guard_current_goal_connection()
returns trigger language plpgsql security definer set search_path=public as $$
declare zone text; effective_date date;
begin
  if tg_table_name in ('habits','daily_routines') and to_jsonb(new)->>'goal_id' is not null then
    perform 1 from monthly_goals where id=(to_jsonb(new)->>'goal_id')::uuid and user_id=new.user_id for key share;
    if not found then
      select settings->>'timeZone' into zone from user_settings where user_id=new.user_id;
      if zone is null or not exists(select 1 from pg_timezone_names where name=zone) then zone := 'Asia/Seoul'; end if;
      effective_date := (now() at time zone zone)::date;
      new.schedule_history := public.detached_goal_history(to_jsonb(new),effective_date,zone);
      new.goal_id := null;
    end if;
  end if;
  if tg_table_name in ('weekly_goals','daily_routines') and to_jsonb(new)->>'monthly_goal_id' is not null then
    perform 1 from monthly_goals where id=(to_jsonb(new)->>'monthly_goal_id')::uuid and user_id=new.user_id for key share;
    if not found then new.monthly_goal_id := null; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_current_goal_connection() from public,anon,authenticated;
create trigger guard_current_goal_connection before insert or update on public.habits
  for each row execute function public.guard_current_goal_connection();
create trigger guard_current_goal_connection before insert or update on public.daily_routines
  for each row execute function public.guard_current_goal_connection();
create trigger guard_current_goal_connection before insert or update on public.weekly_goals
  for each row execute function public.guard_current_goal_connection();

-- Local preparation only: deploy together with the version-aware app.
alter table public.personal_routines add column revision uuid not null default gen_random_uuid();
alter table public.weekly_goals add column revision uuid not null default gen_random_uuid();
create trigger advance_plan_revision before update on public.personal_routines for each row execute function public.advance_goal_revision();
create trigger advance_plan_revision before update on public.weekly_goals for each row execute function public.advance_goal_revision();
revoke insert,update,delete on public.personal_routines,public.weekly_goals from public,anon,authenticated;

create table public.plan_save_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null, payload jsonb not null,
  created_at timestamptz not null default now(), primary key(user_id,request_id)
);
alter table public.plan_save_receipts enable row level security;
revoke all on public.plan_save_receipts from public,anon,authenticated;

create function public.save_plan(request_id uuid, item_kind text, item_id uuid, expected_revision uuid,
  creating boolean, deleting boolean, item_values jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); target_table text; previous jsonb; proposed jsonb; result jsonb;
  receipt public.plan_save_receipts; payload jsonb; allowed text[]; fields text; updates text;
begin
  if uid is null then raise exception '로그인이 필요해요'; end if;
  if item_kind is null or item_kind not in ('bundle','weekly') or request_id is null or item_id is null
    or creating is null or deleting is null or (creating and deleting)
    or jsonb_typeof(item_values) is distinct from 'object' then raise exception '저장 요청을 확인해주세요'; end if;
  target_table:=case when item_kind='bundle' then 'personal_routines' else 'weekly_goals' end;
  payload:=jsonb_build_object('kind',item_kind,'id',item_id,'base',expected_revision,'creating',creating,'deleting',deleting,'values',item_values);
  perform pg_advisory_xact_lock(hashtextextended('plan-request:'||uid::text||':'||request_id::text,0));
  select * into receipt from plan_save_receipts r where r.user_id=uid and r.request_id=save_plan.request_id;
  if found and receipt.payload<>payload then raise exception '같은 요청의 내용이 바뀌었어요'; end if;
  -- Serialize this owner's creates too, so concurrent devices cannot bypass weekly slots/duplicates.
  perform pg_advisory_xact_lock(hashtextextended('plan-owner:'||uid::text,0));
  execute format('select to_jsonb(t) from public.%I t where id=$1 and user_id=$2 for update',target_table) into previous using item_id,uid;
  -- A receipt never replays a write, including after another change/deletion/recreation.
  if receipt.request_id is not null then return jsonb_build_object('status','saved','current',previous); end if;
  if not creating and previous is null and not deleting then return jsonb_build_object('status','deleted','current',null); end if;
  if previous is not null and (creating or expected_revision is distinct from (previous->>'revision')::uuid) then
    return jsonb_build_object('status','conflict','current',previous);
  end if;
  if creating and expected_revision is not null then raise exception '새 항목의 요청을 확인해주세요'; end if;
  if deleting then
    -- Only the container/target is removed. Habits, schedules, logs and review snapshots are untouched.
    execute format('delete from public.%I where id=$1 and user_id=$2',target_table) using item_id,uid;
    result:=null;
  else
    allowed:=case when item_kind='bundle' then array['title','emoji','when_text','habit_ids','habit_durations','timer_enabled']
      when creating then array['title','emoji','week_number','year','start_date','end_date','target_count','linked_kind','linked_id']
      else array['target_count'] end;
    proposed:=coalesce(previous,case when item_kind='bundle' then '{"emoji":"","when_text":"","habit_ids":[],"timer_enabled":false}'::jsonb
      else '{"status":"active","completion_rate":0,"linked_routine_ids":[]}'::jsonb end)
      ||coalesce((select jsonb_object_agg(key,value) from jsonb_each(item_values) where key=any(allowed)),'{}');
    if creating then proposed:=proposed||jsonb_build_object('created_at',now()); end if;
    if coalesce(length(trim(proposed->>'title')),0)=0 then raise exception '이름을 입력해주세요'; end if;
    if item_kind='bundle' then
      if jsonb_typeof(proposed->'habit_ids') is distinct from 'array' then raise exception '습관 구성을 확인해주세요'; end if;
      if exists(select 1 from jsonb_array_elements_text(proposed->'habit_ids') h
        where not exists(select 1 from habits where id::text=h and user_id=uid)
          -- Keep unresolved legacy members when editing; never silently drop them.
          and not (coalesce(previous->'habit_ids','[]') ? h))
        or (select count(*)<>count(distinct h) from jsonb_array_elements_text(proposed->'habit_ids') h) then
        raise exception '본인의 습관을 중복 없이 선택해주세요'; end if;
      if proposed->'habit_durations' is not null and proposed->'habit_durations'<>'null'::jsonb then
        if jsonb_typeof(proposed->'habit_durations') is distinct from 'object' then raise exception '습관 시간을 확인해주세요'; end if;
        if exists(select 1 from jsonb_each(proposed->'habit_durations') d where jsonb_typeof(d.value)<>'number'
          or d.value::text !~ '^[0-9]+$' or (d.value::text)::numeric not between 5 and 3600) then raise exception '습관 시간은 5초부터 60분까지예요'; end if;
      end if;
    else
      if coalesce((proposed->>'target_count')::int not between 1 and 7,true) then raise exception '주간 목표 횟수를 확인해주세요'; end if;
      if creating then
        if coalesce((proposed->>'end_date')::date-(proposed->>'start_date')::date<>6,true)
          or coalesce((proposed->>'week_number')::int not between 1 and 53,true) then raise exception '주간 목표 기간을 확인해주세요'; end if;
        if proposed->>'linked_kind'='habit' then
          if not exists(select 1 from habits where id=(proposed->>'linked_id')::uuid and user_id=uid and archived_at is null) then raise exception '연결할 습관을 확인해주세요'; end if;
        elsif proposed->>'linked_kind'='routine' then
          if not exists(select 1 from daily_routines where id=(proposed->>'linked_id')::uuid and user_id=uid and archived_at is null and is_active) then raise exception '연결할 루틴을 확인해주세요'; end if;
        else raise exception '연결할 실천을 선택해주세요'; end if;
        if exists(select 1 from weekly_goals where user_id=uid and linked_kind=proposed->>'linked_kind' and linked_id=(proposed->>'linked_id')::uuid
          and start_date<=(proposed->>'end_date')::date and end_date>=(proposed->>'start_date')::date) then raise exception '이 실천의 주간 목표가 이미 있어요'; end if;
        if (select count(*) from weekly_goals where user_id=uid and start_date<=(proposed->>'end_date')::date and end_date>=(proposed->>'start_date')::date)
          >= coalesce((select weekly_goal_slots from profiles where id=uid),3) then raise exception '주간 목표 칸이 가득 찼어요'; end if;
      end if;
      -- Editing the target never replaces a previous review settlement or its period/link.
    end if;
    proposed:=proposed||jsonb_build_object('id',item_id,'user_id',uid,'revision',request_id);
    select string_agg(quote_ident(column_name),','),string_agg(format('%I=p.%I',column_name,column_name),',') into fields,updates
      from information_schema.columns where table_schema='public' and information_schema.columns.table_name=target_table;
    if creating then
      execute format('insert into public.%1$I(%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,$1) returning to_jsonb(%1$I.*)',target_table,fields) into result using proposed;
    else
      execute format('update public.%1$I t set %2$s from jsonb_populate_record(null::public.%1$I,$1) p where t.id=$2 and t.user_id=$3 returning to_jsonb(t.*)',target_table,updates) into result using proposed,item_id,uid;
    end if;
  end if;
  insert into plan_save_receipts(user_id,request_id,payload) values(uid,request_id,payload);
  return jsonb_build_object('status','saved','current',result);
end;
$$;
revoke all on function public.save_plan(uuid,text,uuid,uuid,boolean,boolean,jsonb) from public,anon;
grant execute on function public.save_plan(uuid,text,uuid,uuid,boolean,boolean,jsonb) to authenticated;

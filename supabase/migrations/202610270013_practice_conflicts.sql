-- Local preparation only. Deploy together with the version-aware app.
alter table public.habits add column revision uuid not null default gen_random_uuid();
alter table public.daily_routines add column revision uuid not null default gen_random_uuid();
create trigger advance_practice_revision before update on public.habits for each row execute function public.advance_goal_revision();
create trigger advance_practice_revision before update on public.daily_routines for each row execute function public.advance_goal_revision();
revoke insert,update,delete on public.habits,public.daily_routines from public,anon,authenticated;

create table public.practice_save_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null, payload jsonb not null,
  created_at timestamptz not null default now(), primary key(user_id,request_id)
);
alter table public.practice_save_receipts enable row level security;
revoke all on public.practice_save_receipts from public,anon,authenticated;

create function public.practice_rule(item jsonb, from_date date) returns jsonb language sql immutable set search_path=public as $$
  select jsonb_strip_nulls(jsonb_build_object('from',from_date::text,'title',item->'title','emoji',item->'emoji',
    'frequency',item->'frequency','customDays',item->'custom_days','goalId',item->'goal_id',
    'active',item->>'archived_at' is null and coalesce((item->>'is_active')::boolean,true)))
$$;
create function public.practice_history(previous jsonb, proposed jsonb, effective_date date, zone text)
returns jsonb language plpgsql stable set search_path=public as $$
declare history jsonb := coalesce(previous->'schedule_history','[]');
begin
  if practice_rule(previous,effective_date)=practice_rule(proposed,effective_date) then return history; end if;
  if jsonb_array_length(history)=0 then
    history:=jsonb_build_array(practice_rule(previous,((previous->>'created_at')::timestamptz at time zone zone)::date));
  end if;
  -- Never accept client-supplied history. Preserve all earlier server revisions.
  return coalesce((select jsonb_agg(r order by r->>'from') from jsonb_array_elements(history) r where r->>'from'<effective_date::text),'[]')
    || jsonb_build_array(practice_rule(proposed,effective_date));
end;
$$;
revoke all on function public.practice_rule(jsonb,date),public.practice_history(jsonb,jsonb,date,text) from public,anon,authenticated;

create function public.save_practice(request_id uuid, item_kind text, item_id uuid, expected_revision uuid,
  creating boolean, item_values jsonb, effective_date date, p_timezone text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); target_table text; previous jsonb; proposed jsonb; result jsonb;
  receipt public.practice_save_receipts; payload jsonb; allowed text[]; fields text; updates text;
begin
  if uid is null then raise exception '로그인이 필요해요'; end if;
  if item_kind not in ('habit','routine') or item_kind is null or request_id is null or item_id is null or creating is null
    or jsonb_typeof(item_values) is distinct from 'object' or effective_date is null or p_timezone is null
    or not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception '실천 저장 요청을 확인해주세요'; end if;
  if effective_date>(now() at time zone p_timezone)::date then raise exception '미래 날짜로 적용할 수 없어요'; end if;
  target_table:=case when item_kind='habit' then 'habits' else 'daily_routines' end;
  payload:=jsonb_build_object('kind',item_kind,'id',item_id,'base',expected_revision,'creating',creating,'values',item_values,'date',effective_date,'zone',p_timezone);
  perform pg_advisory_xact_lock(hashtextextended('practice-request:'||uid::text||':'||request_id::text,0));
  select * into receipt from practice_save_receipts r where r.user_id=uid and r.request_id=save_practice.request_id;
  if found and receipt.payload<>payload then raise exception '같은 요청의 내용이 바뀌었어요'; end if;
  perform pg_advisory_xact_lock(hashtextextended('practice:'||item_kind||':'||item_id::text,0));
  execute format('select to_jsonb(t) from public.%I t where id=$1 and user_id=$2 for update',target_table) into previous using item_id,uid;
  if receipt.request_id is not null then return jsonb_build_object('status','saved','current',previous); end if;
  if not creating and previous is null then return jsonb_build_object('status','deleted','current',null); end if;
  if previous is not null and (creating or expected_revision is distinct from (previous->>'revision')::uuid
    or exists(select 1 from jsonb_array_elements(previous->'schedule_history') r where r->>'from'>effective_date::text)) then
    return jsonb_build_object('status','conflict','current',previous);
  end if;
  if creating and expected_revision is not null then raise exception '새 실천의 요청을 확인해주세요'; end if;
  allowed:=array['title','emoji','frequency','goal_id','duration_seconds','when_text','two_minute_habit','notification','archived_at'];
  if item_kind='habit' then allowed:=allowed||array['custom_days','mini_routine'];
  else allowed:=allowed||array['is_active','time_slot','duration_minutes']; end if;
  proposed:=coalesce(previous,'{"emoji":"","when_text":"","frequency":"daily"}'::jsonb)||coalesce((select jsonb_object_agg(key,value) from jsonb_each(item_values) where key=any(allowed)),'{}');
  if creating then
    proposed:=proposed||jsonb_build_object('created_at',coalesce(item_values->>'created_at',now()::text),'schedule_history','[]'::jsonb);
    if proposed->>'archived_at' is not null then proposed:=proposed||jsonb_build_object('archived_at',effective_date); end if;
    if item_kind='routine' then proposed:=proposed||jsonb_build_object('type',coalesce(item_values->>'type','faith'),'sort_order',coalesce((item_values->>'sort_order')::int,0),'is_active',coalesce((item_values->>'is_active')::boolean,true)); end if;
  else
    -- Preserve an earlier archive date; a newly archived item starts today/request date.
    if previous->>'archived_at' is distinct from proposed->>'archived_at' and proposed->>'archived_at' is not null then
      proposed:=proposed||jsonb_build_object('archived_at',effective_date);
    end if;
    proposed:=proposed||jsonb_build_object('schedule_history',practice_history(previous,proposed,effective_date,p_timezone));
  end if;
  if coalesce(length(trim(proposed->>'title')),0)=0 then raise exception '실천 이름을 입력해주세요'; end if;
  if item_kind='habit' then
    if proposed->>'frequency' not in ('daily','weekdays','weekends','custom') or proposed->>'frequency' is null then raise exception '반복 주기를 확인해주세요'; end if;
    if proposed->>'frequency'='custom' and (jsonb_typeof(proposed->'custom_days') is distinct from 'array' or jsonb_array_length(proposed->'custom_days')=0) then raise exception '요일을 선택해주세요'; end if;
  else
    if proposed->'frequency' is null or proposed->'frequency'='null'::jsonb or proposed->'frequency' not in ('"daily"'::jsonb,'"weekdays"'::jsonb,'"weekends"'::jsonb) and jsonb_typeof(proposed->'frequency') is distinct from 'array' then raise exception '반복 주기를 확인해주세요'; end if;
    if jsonb_typeof(proposed->'frequency')='array' and jsonb_array_length(proposed->'frequency')=0 then raise exception '요일을 선택해주세요'; end if;
  end if;
  if (item_kind='habit' and proposed->>'frequency'='custom') or (item_kind='routine' and jsonb_typeof(proposed->'frequency')='array') then
    if exists(select 1 from jsonb_array_elements(case when item_kind='habit' then proposed->'custom_days' else proposed->'frequency' end) d
      where jsonb_typeof(d)<>'number' or d::text !~ '^[0-6]$') then raise exception '요일을 확인해주세요'; end if;
  end if;
  proposed:=proposed||jsonb_build_object('id',item_id,'user_id',uid,'revision',request_id);
  -- Only an allowlisted table is interpolated; all user data remains bound parameters.
  select string_agg(quote_ident(column_name),','),string_agg(format('%I=p.%I',column_name,column_name),',') into fields,updates
    from information_schema.columns where table_schema='public' and information_schema.columns.table_name=target_table;
  if creating then
    execute format('insert into public.%1$I(%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,$1) returning to_jsonb(%1$I.*)',target_table,fields) into result using proposed;
  else
    execute format('update public.%1$I t set %2$s from jsonb_populate_record(null::public.%1$I,$1) p where t.id=$2 and t.user_id=$3 returning to_jsonb(t.*)',target_table,updates) into result using proposed,item_id,uid;
  end if;
  insert into practice_save_receipts(user_id,request_id,payload) values(uid,request_id,payload);
  return jsonb_build_object('status','saved','current',result);
end;
$$;
revoke all on function public.save_practice(uuid,text,uuid,uuid,boolean,jsonb,date,text) from public,anon;
grant execute on function public.save_practice(uuid,text,uuid,uuid,boolean,jsonb,date,text) to authenticated;

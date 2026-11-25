-- Local preparation only. Release with the version-aware client; never apply alone.
alter table public.todos add column revision uuid not null default gen_random_uuid();
alter table public.diary_entries add column revision uuid not null default gen_random_uuid();
alter table public.routine_logs add column memo_revision uuid not null default gen_random_uuid();
create trigger advance_record_revision before update on public.todos for each row execute function public.advance_goal_revision();
create trigger advance_record_revision before update on public.diary_entries for each row execute function public.advance_goal_revision();
create function public.advance_memo_revision() returns trigger language plpgsql set search_path=public as $$
begin
  if new.memo is distinct from old.memo and new.memo_revision=old.memo_revision then new.memo_revision:=gen_random_uuid(); end if;
  return new;
end; $$;
create trigger advance_memo_revision before update on public.routine_logs for each row execute function public.advance_memo_revision();
revoke insert,update,delete on public.todos,public.diary_entries,public.routine_logs from public,anon,authenticated;
create table public.record_save_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null, payload jsonb not null, created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table public.record_save_receipts enable row level security;
revoke all on public.record_save_receipts from public,anon,authenticated;

create function public.save_record(request_id uuid, item_kind text, item_key text, expected_revision uuid, mode text, item_values jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); previous jsonb; result jsonb; payload jsonb; receipt public.record_save_receipts;
  rid uuid; day date; target uuid; rev uuid;
begin
  if uid is null then raise exception '로그인이 필요해요'; end if;
  if request_id is null or item_key is null or item_kind is null or item_kind not in ('todo','diary','memo','check')
    or mode is null or mode not in ('create','edit','complete','delete','resolve') or jsonb_typeof(item_values) is distinct from 'object'
    or (item_kind='diary' and mode in ('complete','resolve')) or (item_kind='memo' and mode not in ('create','edit'))
    or (item_kind='check' and mode<>'complete') then raise exception '기록 요청을 확인해주세요'; end if;
  payload:=jsonb_build_object('kind',item_kind,'key',item_key,'base',expected_revision,'mode',mode,'values',item_values);
  perform pg_advisory_xact_lock(hashtextextended('record-request:'||uid::text||':'||request_id::text,0));
  select * into receipt from record_save_receipts r where r.user_id=uid and r.request_id=save_record.request_id;
  if found and receipt.payload<>payload then raise exception '같은 요청의 내용이 바뀌었어요'; end if;
  perform pg_advisory_xact_lock(hashtextextended('record:'||uid::text||':'||case when item_kind='check' then 'memo' else item_kind end||':'||item_key,0));
  if item_kind='todo' then
    target:=item_key::uuid;
    select to_jsonb(t) into previous from todos t where id=target and user_id=uid for update;
  elsif item_kind='diary' then
    day:=item_key::date;
    select to_jsonb(t) into previous from diary_entries t where date=day and user_id=uid for update;
  else
    rid:=split_part(item_key,':',1)::uuid; day:=split_part(item_key,':',2)::date;
    select to_jsonb(t) into previous from routine_logs t where routine_id=rid and date=day and user_id=uid for update;
  end if;
  -- Receipt replay reports current state without repeating a mutation, even after deletion/recreation.
  if receipt.request_id is not null then return jsonb_build_object('status','saved','current',previous); end if;
  if item_kind<>'check' then
    rev:=(previous->>case when item_kind='memo' then 'memo_revision' else 'revision' end)::uuid;
    if previous is not null and (mode='create' or expected_revision is distinct from rev) then
      return jsonb_build_object('status','conflict','current',previous);
    end if;
    if previous is null and mode not in ('create','delete') then return jsonb_build_object('status','deleted','current',null); end if;
    if mode='create' and expected_revision is not null then raise exception '새 기록의 요청을 확인해주세요'; end if;
  end if;
  if item_kind='todo' then
    if mode in ('create','edit','resolve') and (coalesce(length(trim(item_values->>'title')),0) not between 1 and 120) then raise exception '할 일 이름을 확인해주세요'; end if;
    if mode='delete' then delete from todos where id=target and user_id=uid;
    elsif mode='create' then
      insert into todos(id,user_id,title,emoji,date,revision) values(target,uid,trim(item_values->>'title'),item_values->>'emoji',(item_values->>'date')::date,request_id) returning to_jsonb(todos.*) into result;
    elsif mode in ('edit','resolve') then
      if mode='resolve' and jsonb_typeof(item_values->'completed') is distinct from 'boolean' then raise exception '완료 상태를 확인해주세요'; end if;
      update todos set title=trim(item_values->>'title'),emoji=item_values->>'emoji',revision=request_id,
        completed=case when mode='resolve' then (item_values->>'completed')::boolean else completed end,
        completed_at=case when mode<>'resolve' then completed_at when (item_values->>'completed')::boolean then coalesce((item_values->>'completed_at')::timestamptz,now()) else null end where id=target and user_id=uid returning to_jsonb(todos.*) into result;
    else
      if jsonb_typeof(item_values->'completed') is distinct from 'boolean' then raise exception '완료 상태를 확인해주세요'; end if;
      update todos set completed=(item_values->>'completed')::boolean,completed_at=case when (item_values->>'completed')::boolean then coalesce((item_values->>'completed_at')::timestamptz,now()) else null end,revision=request_id
        where id=target and user_id=uid returning to_jsonb(todos.*) into result;
    end if;
  elsif item_kind='diary' then
    if mode='delete' then delete from diary_entries where date=day and user_id=uid;
    else
      if item_values->>'mood' is not null and item_values->>'mood' not in ('great','good','neutral','down','bad')
        or jsonb_typeof(item_values->'content') is distinct from 'string' then raise exception '일기 내용을 확인해주세요'; end if;
      if mode='create' then
        insert into diary_entries(user_id,date,mood,content,revision) values(uid,day,item_values->>'mood',item_values->>'content',request_id) returning to_jsonb(diary_entries.*) into result;
      else update diary_entries set mood=item_values->>'mood',content=item_values->>'content',updated_at=now(),revision=request_id where user_id=uid and date=day returning to_jsonb(diary_entries.*) into result;
      end if;
    end if;
  else
    if previous is null and not exists(select 1 from daily_routines where id=rid and user_id=uid) then raise exception '기록할 본인의 루틴을 확인해주세요'; end if;
    if item_kind='memo' then
      if item_values->'memo' is not null and item_values->'memo'<>'null'::jsonb and jsonb_typeof(item_values->'memo')<>'string' then raise exception '메모 내용을 확인해주세요'; end if;
      if mode='create' then
        insert into routine_logs(user_id,routine_id,date,memo,memo_revision) values(uid,rid,day,item_values->>'memo',request_id) returning to_jsonb(routine_logs.*) into result;
      else
        -- Do not overwrite completion, skips or their timestamp when saving a memo.
        update routine_logs set memo=item_values->>'memo',memo_revision=request_id where user_id=uid and routine_id=rid and date=day returning to_jsonb(routine_logs.*) into result;
      end if;
    else
      if jsonb_typeof(item_values->'completed') is distinct from 'boolean' or jsonb_typeof(item_values->'skipped') is distinct from 'boolean'
        or ((item_values->>'completed')::boolean and (item_values->>'skipped')::boolean) then raise exception '수행 상태를 확인해주세요'; end if;
      -- Check requests never contain a memo mutation. The initial memo revision is known offline too.
      insert into routine_logs(user_id,routine_id,date,completed,skipped,completed_at,memo_revision)
        values(uid,rid,day,(item_values->>'completed')::boolean,(item_values->>'skipped')::boolean,case when (item_values->>'completed')::boolean then coalesce((item_values->>'completed_at')::timestamptz,now()) else null end,request_id)
        on conflict(user_id,routine_id,date) do update set completed=excluded.completed,skipped=excluded.skipped,completed_at=excluded.completed_at
        returning to_jsonb(routine_logs.*) into result;
    end if;
  end if;
  insert into record_save_receipts(user_id,request_id,payload) values(uid,request_id,payload);
  return jsonb_build_object('status','saved','current',result);
end; $$;
revoke all on function public.save_record(uuid,text,text,uuid,text,jsonb) from public,anon;
grant execute on function public.save_record(uuid,text,text,uuid,text,jsonb) to authenticated;

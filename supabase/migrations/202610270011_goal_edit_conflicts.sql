-- Local preparation only. Apply with the matching app version; legacy goal writes fail closed.
alter table public.monthly_goals add column revision uuid not null default gen_random_uuid();

create function public.advance_goal_revision() returns trigger language plpgsql set search_path=public as $$
begin
  if new.revision is not distinct from old.revision then new.revision := gen_random_uuid(); end if;
  return new;
end;
$$;
revoke all on function public.advance_goal_revision() from public,anon,authenticated;
create trigger advance_goal_revision before update on public.monthly_goals
  for each row execute function public.advance_goal_revision();

create table public.goal_save_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  goal_id uuid not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table public.goal_save_receipts enable row level security;
revoke all on public.goal_save_receipts from public,anon,authenticated;
-- Preserve select/delete + the existing deletion/connection cleanup RPC. Never permit blind upsert.
revoke insert,update on public.monthly_goals from public,anon,authenticated;

create function public.save_monthly_goal(request_id uuid, gid uuid, expected_revision uuid, creating boolean, goal_values jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); current_goal public.monthly_goals; proposed public.monthly_goals;
  receipt public.goal_save_receipts; payload jsonb; has_goal boolean;
begin
  if uid is null then raise exception '로그인이 필요해요'; end if;
  if request_id is null or gid is null or creating is null or jsonb_typeof(goal_values) is distinct from 'object' then
    raise exception '목표 저장 요청을 확인해주세요';
  end if;
  payload := jsonb_build_object('gid',gid,'expected_revision',expected_revision,'creating',creating,'values',goal_values);
  -- Same request: immutable payload and one committed write, even after a lost response.
  perform pg_advisory_xact_lock(hashtextextended('goal-request:'||uid::text||':'||request_id::text,0));
  select * into receipt from goal_save_receipts r where r.user_id=uid and r.request_id=save_monthly_goal.request_id;
  if found and receipt.payload <> payload then raise exception '같은 요청의 내용이 바뀌었어요'; end if;
  -- Serialize even two creations of a previously absent ID.
  perform pg_advisory_xact_lock(hashtextextended('goal:'||gid::text,0));
  select * into current_goal from monthly_goals where id=gid and user_id=uid for update;
  has_goal := found;
  if receipt.request_id is not null then
    return jsonb_build_object('status','saved','current',case when has_goal then to_jsonb(current_goal) else null end);
  end if;
  if not creating and not has_goal then return jsonb_build_object('status','deleted','current',null); end if;
  if has_goal and (creating or expected_revision is distinct from current_goal.revision) then
    return jsonb_build_object('status','conflict','current',to_jsonb(current_goal));
  end if;
  if creating and expected_revision is not null then raise exception '새 목표의 저장 요청을 확인해주세요'; end if;
  proposed := jsonb_populate_record(null::public.monthly_goals,goal_values);
  if proposed.title is null or length(trim(proposed.title))=0 or proposed.start_date is null or proposed.end_date is null then
    raise exception '목표 이름과 기간을 확인해주세요';
  end if;
  if creating then
    insert into monthly_goals(id,user_id,title,description,month,year,start_date,end_date,status,to_be_statement,goal_routines,color,category,revision)
    values(gid,uid,proposed.title,proposed.description,extract(month from proposed.start_date),extract(year from proposed.start_date),
      proposed.start_date,proposed.end_date,coalesce(proposed.status,'active'),proposed.to_be_statement,proposed.goal_routines,proposed.color,proposed.category,request_id)
    returning * into current_goal;
  else
    update monthly_goals set title=proposed.title,description=proposed.description,
      month=extract(month from proposed.start_date),year=extract(year from proposed.start_date),
      start_date=proposed.start_date,end_date=proposed.end_date,status=coalesce(proposed.status,'active'),
      to_be_statement=proposed.to_be_statement,goal_routines=proposed.goal_routines,color=proposed.color,category=proposed.category,revision=request_id
      where id=gid and user_id=uid returning * into current_goal;
  end if;
  insert into goal_save_receipts(user_id,request_id,goal_id,payload) values(uid,request_id,gid,payload);
  return jsonb_build_object('status','saved','current',to_jsonb(current_goal));
end;
$$;
revoke all on function public.save_monthly_goal(uuid,uuid,uuid,boolean,jsonb) from public,anon;
grant execute on function public.save_monthly_goal(uuid,uuid,uuid,boolean,jsonb) to authenticated;

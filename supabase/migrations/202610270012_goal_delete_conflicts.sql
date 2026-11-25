-- Local preparation only: release together with the version-aware client.
create table public.goal_delete_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  goal_id uuid not null,
  payload jsonb not null,
  effective_date date,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table public.goal_delete_receipts enable row level security;
revoke all on public.goal_delete_receipts from public,anon,authenticated;
revoke delete on public.monthly_goals from public,anon,authenticated;
revoke all on function public.delete_monthly_goal_preserving_history(uuid,date,text) from public,anon,authenticated;

create function public.delete_monthly_goal_checked(request_id uuid,gid uuid,expected_revision uuid,effective_date date,p_timezone text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid := auth.uid(); current_goal public.monthly_goals;
  receipt public.goal_delete_receipts; payload jsonb; has_goal boolean; applied_date date;
begin
  if uid is null then raise exception '로그인이 필요해요'; end if;
  if request_id is null or gid is null or effective_date is null or p_timezone is null
    or not exists(select 1 from pg_timezone_names where name=p_timezone) then
    raise exception '목표 삭제 요청의 날짜와 시간대를 확인해주세요';
  end if;
  if effective_date > (now() at time zone p_timezone)::date then raise exception '미래 날짜로 삭제할 수 없어요'; end if;
  payload := jsonb_build_object('gid',gid,'expected_revision',expected_revision,'effective_date',effective_date,'p_timezone',p_timezone);
  perform pg_advisory_xact_lock(hashtextextended('goal-delete-request:'||uid::text||':'||request_id::text,0));
  select * into receipt from goal_delete_receipts r where r.user_id=uid and r.request_id=delete_monthly_goal_checked.request_id;
  if found and receipt.payload <> payload then raise exception '같은 요청의 내용이 바뀌었어요'; end if;
  -- Same goal lock as save_monthly_goal: compare and delete atomically.
  perform pg_advisory_xact_lock(hashtextextended('goal:'||gid::text,0));
  select * into current_goal from monthly_goals where id=gid and user_id=uid for update;
  has_goal := found;
  if has_goal and (receipt.request_id is not null or expected_revision is distinct from current_goal.revision) then
    return jsonb_build_object('status','conflict','current',to_jsonb(current_goal));
  end if;
  if receipt.request_id is not null then
    return jsonb_build_object('status','deleted','current',null,'effective_date',receipt.effective_date);
  end if;
  if has_goal then
    perform set_config('onju.goal_delete_date',effective_date::text,true);
    perform set_config('onju.goal_delete_zone',p_timezone,true);
    delete from monthly_goals where id=gid and user_id=uid;
    applied_date := effective_date;
  end if;
  -- Also receipt an already absent goal so retry cannot delete a later recreation.
  insert into goal_delete_receipts(user_id,request_id,goal_id,payload,effective_date)
    values(uid,request_id,gid,payload,applied_date);
  return jsonb_build_object('status','deleted','current',null,'effective_date',applied_date);
end;
$$;
revoke all on function public.delete_monthly_goal_checked(uuid,uuid,uuid,date,text) from public,anon;
grant execute on function public.delete_monthly_goal_checked(uuid,uuid,uuid,date,text) to authenticated;

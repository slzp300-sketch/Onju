alter table public.weekly_reviews add column application_results jsonb;
-- Prepared locally only. Per-step receipts prevent replay after a partial review save.
create table public.review_step_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null, kind text not null, payload jsonb not null, result jsonb not null,
  created_at timestamptz not null default now(), primary key(user_id,request_id)
);
alter table public.review_step_receipts enable row level security;
revoke all on public.review_step_receipts from public,anon,authenticated;

create function public.apply_weekly_review_step(request_id uuid, step_kind text, step_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); receipt public.review_step_receipts; outcome jsonb; current_row jsonb;
  val jsonb; entity_id uuid; bundle public.personal_routines; goal public.weekly_goals;
  review public.weekly_reviews; proposed public.weekly_reviews; share public.group_weekly_shares;
begin
  if uid is null then raise exception '로그인이 필요해요'; end if;
  if request_id is null or step_kind is null or step_kind not in ('practice','bundle','weekly-goal','share','review')
    or jsonb_typeof(step_payload) is distinct from 'object' then raise exception '리뷰 저장 요청을 확인해주세요'; end if;
  perform pg_advisory_xact_lock(hashtextextended('review-step:'||uid::text||':'||request_id::text,0));
  select * into receipt from review_step_receipts r where r.user_id=uid and r.request_id=apply_weekly_review_step.request_id;
  if found then
    if receipt.kind<>step_kind or receipt.payload<>step_payload then raise exception '같은 요청의 내용이 바뀌었어요'; end if;
    return receipt.result||jsonb_build_object('replayed',true);
  end if;

  if step_kind='practice' then
    outcome:=save_practice(request_id,step_payload->>'item_kind',(step_payload->>'item_id')::uuid,
      (step_payload->>'expected_revision')::uuid,(step_payload->>'creating')::boolean,step_payload->'item_values',
      (step_payload->>'effective_date')::date,step_payload->>'p_timezone');
    if outcome->>'status'<>'saved' then return outcome; end if;
  elsif step_kind='bundle' then
    entity_id:=(step_payload->>'id')::uuid;
    select * into bundle from personal_routines where id=entity_id and user_id=uid for update;
    if not found then return jsonb_build_object('status','deleted','current',null); end if;
    if jsonb_typeof(step_payload->'habit_ids') is distinct from 'array' then raise exception '묶음에 추가할 습관을 확인해주세요'; end if;
    if exists(select 1 from jsonb_array_elements_text(step_payload->'habit_ids') h
      where not exists(select 1 from habits where id=h::uuid and user_id=uid)) then
      return jsonb_build_object('status','conflict','current',to_jsonb(bundle));
    end if;
    -- Append to the latest composition; never restore old title/order/timers or removed members on replay.
    update personal_routines p set habit_ids=bundle.habit_ids||coalesce((select array_agg(h order by ord)
      from (select h,min(ord) ord from jsonb_array_elements_text(step_payload->'habit_ids') with ordinality x(h,ord)
        where not h=any(bundle.habit_ids) group by h) additions),'{}'::text[])
      where p.id=entity_id and p.user_id=uid returning to_jsonb(p) into current_row;
    outcome:=jsonb_build_object('status','saved','current',current_row);
  elsif step_kind='weekly-goal' then
    entity_id:=(step_payload->>'id')::uuid;
    select * into goal from weekly_goals where id=entity_id and user_id=uid for update;
    if not found then return jsonb_build_object('status','deleted','current',null); end if;
    if step_payload->'expected' is distinct from jsonb_build_object('start_date',goal.start_date,'end_date',goal.end_date,
      'target_count',goal.target_count,'linked_kind',goal.linked_kind,'linked_id',goal.linked_id,
      'completion_rate',goal.completion_rate,'status',goal.status) then
      return jsonb_build_object('status','conflict','current',to_jsonb(goal));
    end if;
    if coalesce((step_payload->>'completion_rate')::int not between 0 and 100,true) or coalesce(step_payload->>'status' not in ('active','completed'),true) then raise exception '목표 결산을 확인해주세요'; end if;
    update weekly_goals g set completion_rate=(step_payload->>'completion_rate')::int,status=step_payload->>'status'
      where g.id=entity_id and g.user_id=uid returning to_jsonb(g) into current_row;
    outcome:=jsonb_build_object('status','saved','current',current_row);
  elsif step_kind='share' then
    entity_id:=(step_payload->>'id')::uuid;
    -- SECURITY DEFINER must explicitly preserve membership, consent and block checks.
    if not has_community_consent() or not exists(select 1 from group_members m join small_groups g on g.id=m.group_id
      where m.group_id=(step_payload->>'group_id')::uuid and m.user_id=uid and not is_community_blocked(g.creator_id)) then
      return jsonb_build_object('status','conflict','current',null);
    end if;
    perform pg_advisory_xact_lock(hashtextextended('review-share:'||entity_id::text,0));
    select * into share from group_weekly_shares where id=entity_id and user_id=uid for update;
    val:=jsonb_build_object('id',entity_id,'group_id',(step_payload->>'group_id')::uuid,'user_id',uid,
      'week_number',(step_payload->>'week_number')::int,'year',(step_payload->>'year')::int,
      'personal_rate',(step_payload->>'personal_rate')::int,'faith_rate',(step_payload->>'faith_rate')::int,
      'comment',coalesce(step_payload->>'comment',''),'intention',coalesce(step_payload->>'intention',''));
    if share.id is not null then
      if not to_jsonb(share) @> val then return jsonb_build_object('status','conflict','current',to_jsonb(share)); end if;
      current_row:=to_jsonb(share);
    else
      insert into group_weekly_shares(id,group_id,user_id,week_number,year,personal_rate,faith_rate,comment,intention)
        values(entity_id,(val->>'group_id')::uuid,uid,(val->>'week_number')::int,(val->>'year')::int,
          (val->>'personal_rate')::int,(val->>'faith_rate')::int,val->>'comment',val->>'intention') returning to_jsonb(group_weekly_shares) into current_row;
    end if;
    outcome:=jsonb_build_object('status','saved','current',current_row);
  else
    val:=step_payload->'values';
    if jsonb_typeof(val) is distinct from 'object' or not step_payload?'expected' then raise exception '회고 본문을 확인해주세요'; end if;
    perform pg_advisory_xact_lock(hashtextextended('review-week:'||uid::text||':'||(val->>'year')||':'||(val->>'week_number'),0));
    select * into review from weekly_reviews where user_id=uid and year=(val->>'year')::int and week_number=(val->>'week_number')::int for update;
    if (case when review.id is null then 'null'::jsonb else to_jsonb(review) end) is distinct from step_payload->'expected' then
      return jsonb_build_object('status','conflict','current',case when review.id is null then null else to_jsonb(review) end);
    end if;
    proposed:=jsonb_populate_record(null::weekly_reviews,val||jsonb_build_object('user_id',uid));
    insert into weekly_reviews(id,user_id,week_number,year,personal_rate,faith_rate,goal_achieved_count,goal_total_count,
      mood,goal_ratings,comment,intention,share_to_groups,routine_changes,habit_changes,changes_applied_at,application_results,completed_at,created_at)
      values(coalesce(review.id,proposed.id),uid,proposed.week_number,proposed.year,proposed.personal_rate,proposed.faith_rate,
        proposed.goal_achieved_count,proposed.goal_total_count,proposed.mood,coalesce(proposed.goal_ratings,'{}'),
        coalesce(proposed.comment,''),coalesce(proposed.intention,''),coalesce(proposed.share_to_groups,'{}'),coalesce(proposed.routine_changes,'[]'),
        coalesce(proposed.habit_changes,'[]'),proposed.changes_applied_at,proposed.application_results,now(),coalesce(review.created_at,proposed.created_at,now()))
      on conflict(user_id,week_number,year) do update set personal_rate=excluded.personal_rate,faith_rate=excluded.faith_rate,
        goal_achieved_count=excluded.goal_achieved_count,goal_total_count=excluded.goal_total_count,mood=excluded.mood,
        goal_ratings=excluded.goal_ratings,comment=excluded.comment,intention=excluded.intention,share_to_groups=excluded.share_to_groups,
        routine_changes=excluded.routine_changes,habit_changes=excluded.habit_changes,changes_applied_at=excluded.changes_applied_at,application_results=excluded.application_results,completed_at=excluded.completed_at
      returning to_jsonb(weekly_reviews) into current_row;
    outcome:=jsonb_build_object('status','saved','current',current_row);
  end if;
  insert into review_step_receipts(user_id,request_id,kind,payload,result) values(uid,request_id,step_kind,step_payload,outcome);
  return outcome||jsonb_build_object('replayed',false);
end;
$$;
revoke all on function public.apply_weekly_review_step(uuid,text,jsonb) from public,anon;
grant execute on function public.apply_weekly_review_step(uuid,text,jsonb) to authenticated;

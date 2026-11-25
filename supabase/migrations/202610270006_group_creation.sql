-- 생성과 방장 등록을 같은 트랜잭션으로 처리한다. 같은 ID의 재시도는 기존 내용을 보존한다.
create or replace function public.create_group_with_owner(gid uuid, details jsonb default null)
returns void language plpgsql security definer set search_path = public
as $$
declare g public.small_groups%rowtype;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if not public.has_community_consent() then raise exception '소모임 이용 수칙에 동의해주세요'; end if;
  -- 아직 행이 없는 동일 ID의 동시 생성도 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended(gid::text, 0));
  select * into g from public.small_groups where id=gid for update;
  if found then
    if g.creator_id <> auth.uid() then raise exception '내가 만든 소모임만 복구할 수 있어요'; end if;
  else
    if details is null then raise exception '소모임 생성 내용을 찾지 못했어요'; end if;
    if nullif(btrim(details->>'title'),'') is null or nullif(btrim(details->>'goal'),'') is null
      or coalesce((details->>'max_members')::int,0) not between 2 and 10
      or (details->>'start_date')::date is null or (details->>'end_date')::date is null
      or (details->>'end_date')::date < (details->>'start_date')::date then
      raise exception '소모임 이름·목표·기간·인원을 확인해주세요';
    end if;
    insert into public.small_groups(id,creator_id,title,goal,start_date,end_date,max_members,status,is_public,category,cover_icon,color,rules)
    values(gid,auth.uid(),btrim(details->>'title'),btrim(details->>'goal'),(details->>'start_date')::date,
      (details->>'end_date')::date,(details->>'max_members')::int,'recruiting',coalesce((details->>'is_public')::boolean,true),
      details->>'category',details->>'cover_icon',details->>'color',
      array(select jsonb_array_elements_text(coalesce(nullif(details->'rules','null'::jsonb),'[]'::jsonb))));
  end if;
  insert into public.group_members(group_id,user_id,role) values(gid,auth.uid(),'creator')
  on conflict(group_id,user_id) do update set role='creator';
end $$;
revoke all on function public.create_group_with_owner(uuid,jsonb) from public, anon;
grant execute on function public.create_group_with_owner(uuid,jsonb) to authenticated;

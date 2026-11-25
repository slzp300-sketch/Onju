-- 가입은 그룹 행 잠금으로 정원을 직렬화하고, 재시도는 현재 회원 상태로 판정한다.
create or replace function public.join_group(gid uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare g public.small_groups%rowtype;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select * into g from public.small_groups where id=gid for update;
  if not found then raise exception '존재하지 않는 소모임이에요'; end if;
  if exists(select 1 from public.group_members where group_id=gid and user_id=auth.uid()) then return; end if;
  if not g.is_public or public.is_community_blocked(g.creator_id) then raise exception '참여할 수 없는 소모임이에요'; end if;
  if g.status <> 'recruiting' or g.end_date < (now() at time zone 'Asia/Seoul')::date then raise exception '모집이 종료된 소모임이에요'; end if;
  if (select count(*) from public.group_members where group_id=gid) >= g.max_members then raise exception '정원이 가득 찼어요'; end if;
  insert into public.group_members(group_id,user_id,role) values(gid,auth.uid(),'member');
end $$;

create or replace function public.leave_group(gid uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare creator uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select creator_id into creator from public.small_groups where id=gid for update;
  if creator=auth.uid() then raise exception '방장은 소모임을 나갈 수 없어요'; end if;
  delete from public.group_members where group_id=gid and user_id=auth.uid();
end $$;
revoke all on function public.join_group(uuid), public.leave_group(uuid) from public, anon;
grant execute on function public.join_group(uuid), public.leave_group(uuid) to authenticated;

-- 일반 회원이 테이블 직접 쓰기로 RPC의 정원·모집 검사를 우회하지 못하게 한다.
-- 기존 생성 흐름(소모임 생성 → 방장 멤버십)은 허용한다.
drop policy members_insert on public.group_members;
create policy members_insert on public.group_members for insert to authenticated
with check (user_id=auth.uid() and role='creator' and exists(select 1 from public.small_groups g where g.id=group_id and g.creator_id=auth.uid()));
drop policy members_delete on public.group_members;
create policy members_delete on public.group_members for delete to authenticated
using (user_id=auth.uid() and not exists(select 1 from public.small_groups g where g.id=group_id and g.creator_id=auth.uid()));

-- 멤버십의 group_id·role을 직접 변경해 가입 검사를 우회하는 경로도 닫는다.
drop policy members_update on public.group_members;

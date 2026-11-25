-- 코드 보유자 한 명이 7일 이내 가입. 코드는 탐색/멤버 조회 API에 노출하지 않는다.
create table public.group_invites (
  id uuid primary key,
  group_id uuid not null references public.small_groups(id) on delete cascade,
  code text not null unique default replace(gen_random_uuid()::text,'-',''),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days',
  revoked_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null
);
create index group_invites_group_id_idx on public.group_invites(group_id);
alter table public.group_invites enable row level security;
revoke all on public.group_invites from public, anon, authenticated;
grant select on public.group_invites to authenticated;
grant all on public.group_invites to service_role;
create policy group_invites_owner_read on public.group_invites for select to authenticated
using (exists(select 1 from public.small_groups g where g.id=group_id and g.creator_id=auth.uid()));

create function public.issue_group_invite(gid uuid, request_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare g public.small_groups%rowtype; previous public.group_invites%rowtype;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select * into g from public.small_groups where id=gid for update;
  if not found or g.creator_id<>auth.uid() then raise exception '방장만 초대를 관리할 수 있어요'; end if;
  if not public.has_community_consent() then raise exception '소모임 이용 수칙에 동의해주세요'; end if;
  select * into previous from public.group_invites where id=request_id;
  if found then
    if previous.group_id<>gid then raise exception '다른 초대 요청이에요'; end if;
    return; -- 응답 유실 뒤 재시도해도 같은 코드·만료·사용 상태를 유지한다.
  end if;
  if g.is_public or g.status<>'recruiting' or g.end_date<(now() at time zone 'Asia/Seoul')::date then
    raise exception '모집 중인 비공개 소모임에서만 초대할 수 있어요'; end if;
  if (select count(*) from public.group_members where group_id=gid)>=g.max_members then raise exception '정원이 가득 찼어요'; end if;
  if (select count(*) from public.group_invites where group_id=gid and revoked_at is null and redeemed_at is null and expires_at>now())>=20 then
    raise exception '사용하지 않은 초대를 먼저 폐기해주세요'; end if;
  insert into public.group_invites(id,group_id) values(request_id,gid);
end $$;

create function public.revoke_group_invite(gid uuid, invite_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare g public.small_groups%rowtype;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select * into g from public.small_groups where id=gid for update;
  if not found or g.creator_id<>auth.uid() then raise exception '방장만 초대를 관리할 수 있어요'; end if;
  update public.group_invites set revoked_at=coalesce(revoked_at,now()) where id=invite_id and group_id=gid;
end $$;

create function public.preview_group_invite(p_code text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare inv public.group_invites%rowtype; g public.small_groups%rowtype; count_members int; state text;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if not public.has_community_consent() then raise exception '소모임 이용 수칙에 동의해주세요'; end if;
  select * into inv from public.group_invites where code=lower(regexp_replace(p_code,'[\s-]','','g'));
  if not found then return jsonb_build_object('state','invalid'); end if;
  select * into g from public.small_groups where id=inv.group_id;
  if not found or public.is_community_blocked(g.creator_id) then return jsonb_build_object('state','invalid'); end if;
  if public.is_group_member(g.id) then state:='joined';
  elsif inv.revoked_at is not null then return jsonb_build_object('state','revoked');
  elsif inv.redeemed_at is not null then return jsonb_build_object('state','used');
  elsif inv.expires_at<=now() then return jsonb_build_object('state','expired');
  elsif g.is_public or g.status<>'recruiting' or g.end_date<(now() at time zone 'Asia/Seoul')::date then return jsonb_build_object('state','closed');
  else state:='available'; end if;
  select count(*) into count_members from public.group_members where group_id=g.id;
  if state='available' and count_members>=g.max_members then state:='full'; end if;
  return jsonb_build_object('state',state,'groupId',g.id,'title',g.title,'goal',g.goal,'rules',g.rules,
    'endDate',g.end_date,'memberCount',count_members,'maxMembers',g.max_members,'expiresAt',inv.expires_at);
end $$;

create function public.accept_group_invite(p_code text)
returns uuid language plpgsql security definer set search_path=public as $$
declare inv public.group_invites%rowtype; g public.small_groups%rowtype; gid uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if not public.has_community_consent() then raise exception '소모임 이용 수칙에 동의해주세요'; end if;
  select group_id into gid from public.group_invites where code=lower(regexp_replace(p_code,'[\s-]','','g'));
  if not found then raise exception '사용할 수 없는 초대 코드예요'; end if;
  -- 가입·마감·폐기와 같은 순서로 잠근다. 정원 검사와 코드 소비는 같은 트랜잭션이다.
  select * into g from public.small_groups where id=gid for update;
  select * into inv from public.group_invites where code=lower(regexp_replace(p_code,'[\s-]','','g')) for update;
  if g.id is null or inv.id is null or public.is_community_blocked(g.creator_id) then raise exception '사용할 수 없는 초대 코드예요'; end if;
  if public.is_group_member(gid) then return gid; end if;
  if inv.revoked_at is not null or inv.redeemed_at is not null or inv.expires_at<=now() then raise exception '만료·폐기되었거나 이미 사용된 초대 코드예요'; end if;
  if g.is_public or g.status<>'recruiting' or g.end_date<(now() at time zone 'Asia/Seoul')::date then raise exception '모집이 종료된 소모임이에요'; end if;
  if (select count(*) from public.group_members where group_id=gid)>=g.max_members then raise exception '정원이 가득 찼어요'; end if;
  insert into public.group_members(group_id,user_id,role) values(gid,auth.uid(),'member');
  update public.group_invites set redeemed_at=now(),redeemed_by=auth.uid() where id=inv.id;
  return gid;
end $$;
revoke all on function public.issue_group_invite(uuid,uuid), public.revoke_group_invite(uuid,uuid), public.preview_group_invite(text), public.accept_group_invite(text) from public,anon;
grant execute on function public.issue_group_invite(uuid,uuid), public.revoke_group_invite(uuid,uuid), public.preview_group_invite(text), public.accept_group_invite(text) to authenticated;

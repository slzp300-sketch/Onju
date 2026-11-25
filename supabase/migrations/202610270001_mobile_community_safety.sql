-- 모바일 소모임: 수칙 동의, 신고 접수, 사용자 차단.
create table public.community_consents (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  version text not null check (version = '2026-10-27'),
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);
create table public.user_blocks (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_user_id),
  check (user_id <> blocked_user_id)
);
create index user_blocks_target_idx on public.user_blocks(blocked_user_id, user_id);
create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('group', 'member', 'weekly_share', 'routine_share', 'proof')),
  target_id uuid not null,
  group_id uuid references public.small_groups(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  reason text not null check (reason in ('harassment', 'sexual', 'spam', 'privacy', 'other')),
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index content_reports_queue_idx on public.content_reports(status, created_at);

alter table public.community_consents enable row level security;
alter table public.user_blocks enable row level security;
alter table public.content_reports enable row level security;
revoke all on public.community_consents, public.user_blocks, public.content_reports from anon, authenticated;
grant select, insert on public.community_consents to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
grant select on public.content_reports to authenticated;
grant all on public.community_consents, public.user_blocks, public.content_reports to service_role;
create policy consents_select on public.community_consents for select to authenticated using (user_id = auth.uid());
create policy consents_insert on public.community_consents for insert to authenticated with check (user_id = auth.uid());
create policy blocks_select on public.user_blocks for select to authenticated using (user_id = auth.uid());
create policy blocks_insert on public.user_blocks for insert to authenticated with check (user_id = auth.uid());
create policy blocks_delete on public.user_blocks for delete to authenticated using (user_id = auth.uid());
create policy reports_select on public.content_reports for select to authenticated using (reporter_id = auth.uid());

create function public.has_community_consent()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from community_consents where user_id = auth.uid() and version = '2026-10-27'); $$;
create function public.is_community_blocked(target uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from user_blocks
    where (user_id = auth.uid() and blocked_user_id = target)
       or (blocked_user_id = auth.uid() and user_id = target));
$$;
revoke all on function public.has_community_consent(), public.is_community_blocked(uuid) from public, anon;
grant execute on function public.has_community_consent(), public.is_community_blocked(uuid) to authenticated;

-- permissive 정책에 추가: 기존 멤버·본인 소유 검사와 반드시 함께 통과해야 한다.
create policy community_groups_read on public.small_groups as restrictive for select to authenticated
  using (not public.is_community_blocked(creator_id));
create policy community_groups_write on public.small_groups as restrictive for insert to authenticated
  with check (public.has_community_consent());
create policy community_groups_update on public.small_groups as restrictive for update to authenticated
  using (public.has_community_consent()) with check (public.has_community_consent());
create policy community_shares_read on public.group_weekly_shares as restrictive for select to authenticated
  using (not public.is_community_blocked(user_id));
create policy community_shares_write on public.group_weekly_shares as restrictive for insert to authenticated
  with check (public.has_community_consent());
create policy community_shares_update on public.group_weekly_shares as restrictive for update to authenticated
  using (public.has_community_consent()) with check (public.has_community_consent());
create policy community_routines_read on public.shared_routines as restrictive for select to authenticated
  using (not public.is_community_blocked(user_id));
create policy community_routines_write on public.shared_routines as restrictive for insert to authenticated
  with check (public.has_community_consent());
create policy community_proofs_read on public.routine_proofs as restrictive for select to authenticated
  using (not public.is_community_blocked(user_id));
create policy community_proofs_write on public.routine_proofs as restrictive for insert to authenticated
  with check (public.has_community_consent());
create policy community_photos_write on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'proofs' or public.has_community_consent());
create policy community_cheers_write on public.cheers as restrictive for insert to authenticated
  with check (exists (select 1 from public.group_weekly_shares s where s.id = share_id and s.group_id = cheers.group_id));

create or replace function public.adopt_shared_routine(sid uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if not exists (select 1 from public.shared_routines s where s.id = sid
    and public.is_group_member(s.group_id) and not public.is_community_blocked(s.user_id)) then
    raise exception '루틴을 확인할 수 없어요';
  end if;
  update public.shared_routines set adopt_count = adopt_count + 1 where id = sid;
end;
$$;
revoke all on function public.adopt_shared_routine(uuid) from public, anon;
grant execute on function public.adopt_shared_routine(uuid) to authenticated;

-- security definer 집계도 차단 필터를 거쳐야 한다. 내부 함수 직접 실행은 금지한다.
alter function public.get_group_member_progress(uuid) rename to get_group_member_progress_unfiltered;
revoke all on function public.get_group_member_progress_unfiltered(uuid) from public, anon, authenticated;
create function public.get_group_member_progress(gid uuid)
returns table (user_id uuid, user_name text, profile_image text, today_personal_rate int, today_faith_rate int, weekly_rate int, streak int)
language sql stable security definer set search_path = public
as $$ select p.* from public.get_group_member_progress_unfiltered(gid) p where not public.is_community_blocked(p.user_id); $$;
revoke all on function public.get_group_member_progress(uuid) from public, anon;
grant execute on function public.get_group_member_progress(uuid) to authenticated;

-- 대상 작성자·소모임은 클라이언트가 보낸 값을 믿지 않고 서버에서 확인한다.
create function public.report_community_content(p_type text, p_target uuid, p_group uuid, p_reason text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  target_user uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if p_type = 'group' then
    select creator_id into target_user from small_groups
      where id = p_target and id = p_group and (is_public or public.is_group_member(id));
  elsif p_type = 'member' and public.is_group_member(p_group) then
    select user_id into target_user from group_members where group_id = p_group and user_id = p_target;
  elsif p_type = 'weekly_share' and public.is_group_member(p_group) then
    select user_id into target_user from group_weekly_shares where id = p_target and group_id = p_group;
  elsif p_type = 'routine_share' and public.is_group_member(p_group) then
    select user_id into target_user from shared_routines where id = p_target and group_id = p_group;
  elsif p_type = 'proof' and public.is_group_member(p_group) then
    select user_id into target_user from routine_proofs where id = p_target and group_id = p_group;
  end if;
  if target_user is null or target_user = auth.uid() then raise exception '신고할 대상을 확인해주세요'; end if;
  insert into content_reports(reporter_id, target_type, target_id, group_id, target_user_id, reason)
    values (auth.uid(), p_type, p_target, p_group, target_user, p_reason)
    on conflict (reporter_id, target_type, target_id) do nothing;
end;
$$;
revoke all on function public.report_community_content(text, uuid, uuid, text) from public, anon;
grant execute on function public.report_community_content(text, uuid, uuid, text) to authenticated;

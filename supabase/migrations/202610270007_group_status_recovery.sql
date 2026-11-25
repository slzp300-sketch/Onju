-- 방장 변경과 가입은 같은 소모임 행을 잠근다. 같은 요청의 재시도는 현재 상태로 판정한다.
create or replace function public.change_group_status(gid uuid, next_status text, expected_status text)
returns void language plpgsql security definer set search_path = public
as $$
declare g public.small_groups%rowtype;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  select * into g from public.small_groups where id=gid for update;
  if not found or g.creator_id <> auth.uid() then raise exception '방장만 소모임 상태를 변경할 수 있어요'; end if;
  if not public.has_community_consent() then raise exception '소모임 이용 수칙에 동의해주세요'; end if;
  if next_status is null or expected_status is null or not (
    (expected_status='recruiting' and next_status='active') or
    (expected_status='active' and next_status='completed')
  ) then raise exception '허용되지 않는 상태 변경이에요'; end if;
  if g.status = next_status then return; end if;
  if g.status <> expected_status then raise exception '소모임 상태가 바뀌었어요. 현재 상태를 확인해주세요'; end if;
  if next_status='active' and g.end_date < (now() at time zone 'Asia/Seoul')::date then
    raise exception '기간이 지난 소모임은 시작할 수 없어요';
  end if;
  update public.small_groups set status=next_status where id=gid;
end $$;
revoke all on function public.change_group_status(uuid,text,text) from public, anon;
grant execute on function public.change_group_status(uuid,text,text) to authenticated;

-- 구버전의 직접 UPDATE도 종료 후 재시작/모집 재개/단계 건너뛰기를 할 수 없다.
-- 인증 없는 서버 유지보수는 기존 권한을 따른다.
create or replace function public.guard_group_status_transition()
returns trigger language plpgsql set search_path = public
as $$
begin
  if auth.uid() is not null and new.status is distinct from old.status then
    if old.creator_id <> auth.uid() then raise exception '방장만 소모임 상태를 변경할 수 있어요'; end if;
    if not ((old.status='recruiting' and new.status='active') or (old.status='active' and new.status='completed')) then
      raise exception '허용되지 않는 상태 변경이에요';
    end if;
    if new.status='active' and old.end_date < (now() at time zone 'Asia/Seoul')::date then
      raise exception '기간이 지난 소모임은 시작할 수 없어요';
    end if;
  end if;
  return new;
end $$;
create trigger guard_group_status_transition before update of status on public.small_groups
for each row execute function public.guard_group_status_transition();

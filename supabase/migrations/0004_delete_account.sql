-- 계정 삭제 — 스토어 정책(앱 안에서 계정을 삭제할 수 있어야 함) 대응.
-- auth.users 행을 지우면 profiles를 포함한 모든 사용자 데이터가 fk cascade로 함께 삭제된다.
-- 내가 만든 소모임(small_groups.creator_id)도 cascade로 그룹째 삭제된다.
create or replace function public.delete_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

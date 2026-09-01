-- ============================================================
-- 루틴 공유 + 인증 보드 (모임 스코프)
-- 공유는 공유 시점의 스냅샷 — 원본 루틴 수정·삭제와 분리된다.
-- 인증(routine_proofs)은 셋로그식 즉석 무보정 사진 1장 + 한 줄 메모.
-- ============================================================

create table public.shared_routines (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.small_groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_routine_id uuid,           -- 원본 루틴 id (fk 없음 — 원본 삭제에도 공유 유지)
  title text not null,
  emoji text,
  when_text text not null default '',
  kind text not null default 'personal' check (kind in ('personal', 'faith')),
  steps jsonb not null default '[]'::jsonb,  -- ["스트레칭 5분", ...] 스텝 제목 스냅샷
  adopt_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (group_id, user_id, source_routine_id)
);
create index shared_routines_group_idx on public.shared_routines (group_id, created_at desc);

create table public.shared_routine_cheers (
  share_id uuid not null references public.shared_routines(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (share_id, user_id)
);

create table public.routine_proofs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.small_groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  routine_id uuid,                  -- 클라이언트 매칭용 (fk 없음 — 루틴 삭제에도 기록 유지)
  routine_title text not null,
  routine_emoji text,
  photo_path text not null,         -- storage 'proofs' 버킷 내 경로: {user_id}/{uuid}.jpg
  note text not null default '',
  proof_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index routine_proofs_group_date_idx
  on public.routine_proofs (group_id, proof_date desc, created_at desc);
create index routine_proofs_user_date_idx
  on public.routine_proofs (user_id, proof_date desc);

create table public.proof_reactions (
  proof_id uuid not null references public.routine_proofs(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('heart', 'fire', 'clap')),
  created_at timestamptz not null default now(),
  primary key (proof_id, user_id, emoji)
);

-- ── RLS: 멤버만 조회, 본인 것만 쓰기 (cheers 패턴 준용) ──
alter table public.shared_routines enable row level security;
alter table public.shared_routine_cheers enable row level security;
alter table public.routine_proofs enable row level security;
alter table public.proof_reactions enable row level security;

create policy "shared_routines_select" on public.shared_routines
  for select to authenticated using (public.is_group_member(group_id));
create policy "shared_routines_insert" on public.shared_routines
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_group_member(group_id));
create policy "shared_routines_delete" on public.shared_routines
  for delete to authenticated using (user_id = auth.uid());

create policy "share_cheers_select" on public.shared_routine_cheers
  for select to authenticated using (
    exists (select 1 from public.shared_routines s
            where s.id = share_id and public.is_group_member(s.group_id))
  );
create policy "share_cheers_insert" on public.shared_routine_cheers
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.shared_routines s
                where s.id = share_id and public.is_group_member(s.group_id))
  );
create policy "share_cheers_delete" on public.shared_routine_cheers
  for delete to authenticated using (user_id = auth.uid());

create policy "proofs_select" on public.routine_proofs
  for select to authenticated using (public.is_group_member(group_id));
create policy "proofs_insert" on public.routine_proofs
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_group_member(group_id));
create policy "proofs_delete" on public.routine_proofs
  for delete to authenticated using (user_id = auth.uid());

create policy "proof_reactions_select" on public.proof_reactions
  for select to authenticated using (
    exists (select 1 from public.routine_proofs p
            where p.id = proof_id and public.is_group_member(p.group_id))
  );
create policy "proof_reactions_insert" on public.proof_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.routine_proofs p
                where p.id = proof_id and public.is_group_member(p.group_id))
  );
create policy "proof_reactions_delete" on public.proof_reactions
  for delete to authenticated using (user_id = auth.uid());

-- ── 담아가기 카운트 (타인 행 update는 RLS로 막혀 있어 RPC로 원자 증가) ──
create or replace function public.adopt_shared_routine(sid uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요';
  end if;
  if not exists (
    select 1 from shared_routines s
    where s.id = sid and public.is_group_member(s.group_id)
  ) then
    raise exception '모임 멤버만 담아갈 수 있어요';
  end if;
  update shared_routines set adopt_count = adopt_count + 1 where id = sid;
end;
$$;

-- ── Storage: 인증 사진 버킷 (비공개) ──
-- 경로 규칙: {user_id}/{uuid}.jpg — 업로드·삭제는 본인 폴더만,
-- 조회는 그 사진을 참조하는 인증의 그룹 멤버만.
insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', false)
on conflict (id) do nothing;

create policy "proofs_photo_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "proofs_photo_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'proofs' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.routine_proofs p
        where p.photo_path = name and public.is_group_member(p.group_id)
      )
    )
  );

create policy "proofs_photo_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);

-- 참고: 스토리지 비용 관리가 필요해지면 pg_cron으로
-- 90일 지난 routine_proofs + 사진 객체 삭제 잡을 추가한다 (지금은 미적용).

-- 루틴마다 사용자가 선택한 관리 강도를 보존한다.
-- 같은 루틴이 여러 요일에 배치되어도 하나의 설정으로 함께 관리한다.

alter table public.web_mvp_routine_items
  add column routine_key text not null default '',
  add column grade text not null default 'normal'
    check (grade in ('observation', 'normal', 'strong', 'excluded')),
  add column grade_updated_at timestamptz not null default now();

update public.web_mvp_routine_items
set routine_key = coalesce(
  nullif(lower(trim(regexp_replace(title, '\s*[·|]\s*[0-9]+\s*분.*$', '', 'g'))), ''),
  lower(trim(title))
);

alter table public.web_mvp_routine_items
  add constraint web_mvp_routine_items_routine_key_length
  check (char_length(routine_key) between 1 and 180);

create index web_mvp_routine_items_session_key_idx
  on public.web_mvp_routine_items (session_id, routine_key)
  where active;

comment on column public.web_mvp_routine_items.routine_key is '요일별 계획을 하나의 논리적 루틴으로 묶는 정규화 키.';
comment on column public.web_mvp_routine_items.grade is '사용자가 직접 선택한 관리 강도: 관찰, 일반, 강함, 제외.';

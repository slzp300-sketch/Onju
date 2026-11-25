-- Forward-only security migration; do not deploy until both migration ledgers
-- have been reconciled. No legacy owner is inferred or silently assigned.
alter table public.web_mvp_agent_sessions add column if not exists access_token_hash text;

create table if not exists public.web_mvp_provider_responses (
  response_id text primary key,
  session_id uuid not null references public.web_mvp_agent_sessions(session_id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists web_mvp_provider_responses_session_idx on public.web_mvp_provider_responses(session_id);
alter table public.web_mvp_provider_responses enable row level security;
revoke all on public.web_mvp_provider_responses from public, anon, authenticated;
grant select, insert, delete on public.web_mvp_provider_responses to service_role;

create table if not exists public.web_mvp_session_tombstones (
  session_id uuid primary key,
  token_hash text,
  revoked_at timestamptz not null default now()
);
alter table public.web_mvp_session_tombstones enable row level security;
revoke all on public.web_mvp_session_tombstones from public, anon, authenticated;
grant all on public.web_mvp_session_tombstones to service_role;

create or replace function public.web_mvp_authorize_session(p_session_id uuid, p_token_hash text)
returns text language plpgsql security definer set search_path = public as $$
declare
  current_session public.web_mvp_agent_sessions%rowtype;
begin
  if p_session_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid_session_token';
  end if;
  -- Serialize creation of the same UUID; existing rows are additionally locked.
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  if exists (select 1 from public.web_mvp_session_tombstones where session_id = p_session_id) then
    return 'session_revoked';
  end if;
  select * into current_session from public.web_mvp_agent_sessions
    where session_id = p_session_id for update;
  if not found then
    -- Recheck after waiting for a concurrent deletion to commit.
    if exists (select 1 from public.web_mvp_session_tombstones where session_id = p_session_id) then
      return 'session_revoked';
    end if;
    insert into public.web_mvp_agent_sessions(session_id, access_token_hash, expires_at)
      values (p_session_id, p_token_hash, now() + interval '30 days');
    return 'created';
  end if;
  if current_session.access_token_hash is null then return 'session_recovery_required'; end if;
  if current_session.access_token_hash <> p_token_hash then return 'session_forbidden'; end if;
  if current_session.expires_at <= now() then return 'session_expired'; end if;
  -- Do not change updated_at: it is the conversation's optimistic version.
  update public.web_mvp_agent_sessions set expires_at = now() + interval '30 days'
    where session_id = p_session_id;
  return 'authorized';
end;
$$;

create or replace function public.web_mvp_guard_session_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    insert into public.web_mvp_session_tombstones(session_id, token_hash)
      values (old.session_id, old.access_token_hash) on conflict (session_id) do nothing;
    return old;
  end if;
  if exists (select 1 from public.web_mvp_session_tombstones where session_id = new.session_id) then
    raise exception 'session_revoked';
  end if;
  if tg_op = 'UPDATE' then
    if new.session_id <> old.session_id or new.access_token_hash is distinct from old.access_token_hash then
      raise exception 'session_forbidden';
    end if;
    if old.access_token_hash is null then raise exception 'session_recovery_required'; end if;
    if old.expires_at <= now() then raise exception 'session_expired'; end if;
  elsif new.access_token_hash is null or new.access_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_session_token';
  end if;
  return new;
end;
$$;
drop trigger if exists web_mvp_guard_session_row on public.web_mvp_agent_sessions;
create trigger web_mvp_guard_session_row before insert or update or delete
  on public.web_mvp_agent_sessions for each row execute function public.web_mvp_guard_session_row();

create or replace function public.web_mvp_delete_owned_session(p_session_id uuid, p_token_hash text)
returns text language plpgsql security definer set search_path = public as $$
declare current_session public.web_mvp_agent_sessions%rowtype; prior_hash text;
begin
  if p_session_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid_session_token';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select token_hash into prior_hash from public.web_mvp_session_tombstones where session_id = p_session_id;
  if found then
    if prior_hash = p_token_hash then return 'deleted'; end if;
    return 'session_forbidden';
  end if;
  select * into current_session from public.web_mvp_agent_sessions where session_id = p_session_id for update;
  if not found then return 'session_not_found'; end if;
  if current_session.access_token_hash is null then return 'session_recovery_required'; end if;
  if current_session.access_token_hash <> p_token_hash then return 'session_forbidden'; end if;
  -- Owners may delete even an expired session; never renew or create it here.
  delete from public.web_mvp_agent_sessions where session_id = p_session_id;
  -- Trigger records the tombstone; existing FK cascades delete child data.
  return 'deleted';
end;
$$;

create or replace function public.web_mvp_guard_child_session()
returns trigger language plpgsql security definer set search_path = public as $$
declare session_expiry timestamptz; owner_hash text;
begin
  if tg_op = 'UPDATE' and new.session_id is distinct from old.session_id then
    raise exception 'session_forbidden';
  end if;
  if new.session_id is null then return new; end if;
  -- The key-share lock prevents deletion until this write finishes. A write
  -- arriving after deletion cannot attach itself to a recreated parent.
  select expires_at, access_token_hash into session_expiry, owner_hash
    from public.web_mvp_agent_sessions where session_id = new.session_id for key share;
  if not found then raise exception 'session_revoked'; end if;
  if owner_hash is null then raise exception 'session_recovery_required'; end if;
  if session_expiry <= now() then raise exception 'session_expired'; end if;
  return new;
end;
$$;

-- Install on the actually present session-linked tables, not assumed snapshots.
-- Run this migration after all reconciled base migrations; future linked tables
-- must explicitly install the same write guard.
do $$ declare item record;
begin
  for item in
    select distinct ns.nspname, tbl.relname from pg_constraint fk
    join pg_class tbl on tbl.oid = fk.conrelid
    join pg_namespace ns on ns.oid = tbl.relnamespace
    join pg_attribute col on col.attrelid = tbl.oid and col.attnum = any(fk.conkey)
    where fk.contype = 'f' and fk.confrelid = 'public.web_mvp_agent_sessions'::regclass
      and ns.nspname = 'public' and col.attname = 'session_id'
  loop
    execute format('drop trigger if exists web_mvp_guard_child_session on %I.%I', item.nspname, item.relname);
    execute format('create trigger web_mvp_guard_child_session before insert or update on %I.%I for each row execute function public.web_mvp_guard_child_session()', item.nspname, item.relname);
  end loop;
end $$;

revoke all on function public.web_mvp_authorize_session(uuid, text) from public, anon, authenticated;
revoke all on function public.web_mvp_delete_owned_session(uuid, text) from public, anon, authenticated;
revoke all on function public.web_mvp_guard_session_row() from public, anon, authenticated;
revoke all on function public.web_mvp_guard_child_session() from public, anon, authenticated;
grant execute on function public.web_mvp_authorize_session(uuid, text) to service_role;
grant execute on function public.web_mvp_delete_owned_session(uuid, text) to service_role;
comment on table public.web_mvp_session_tombstones is 'Revoked session UUID and one-way ownership hash only. Prevents delayed requests from resurrecting deleted sessions; no conversation content.';

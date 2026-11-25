-- Stage 5: owned snapshot export. Apply after reconciled base + stages 2–4.
-- STABLE gives every read the calling statement's snapshot; never renew/create a session.
create or replace function public.web_mvp_export_owned_session(p_session_id uuid, p_token_hash text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  owned public.web_mvp_agent_sessions%rowtype;
  session_json jsonb;
  context_json jsonb;
  collections jsonb := '{}'::jsonb;
  unavailable jsonb := '[]'::jsonb;
  rows_json jsonb;
  relation_name text;
  relation_oid regclass;
  allowed text[] := array[
    'web_mvp_routine_items','web_mvp_daily_logs','web_mvp_item_logs',
    'web_mvp_checkin_preferences','web_mvp_checkin_sessions','web_mvp_rule_trials',
    'web_mvp_weekly_reviews','web_mvp_daily_adaptations','web_mvp_test_events',
    'web_mvp_diagnostic_reports','web_mvp_ai_usage_events','web_mvp_product_events'
  ];
begin
  if p_session_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('error','invalid_session_token');
  end if;
  select * into owned from public.web_mvp_agent_sessions where session_id=p_session_id;
  if not found then
    if exists(select 1 from public.web_mvp_session_tombstones where session_id=p_session_id and token_hash=p_token_hash) then
      return jsonb_build_object('error','session_revoked');
    end if;
    return jsonb_build_object('error','session_not_found');
  end if;
  if owned.access_token_hash is null then return jsonb_build_object('error','session_recovery_required'); end if;
  if owned.access_token_hash <> p_token_hash then return jsonb_build_object('error','session_forbidden'); end if;

  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into session_json
  from jsonb_each(to_jsonb(owned))
  where key = any(array['session_id','stage','messages','blocks','pending_blocks','day_bounds',
    'goal','reason','obstacle','goal_card','generated_plan','pending_plan','plan_revision_history',
    'agent_v2_suggestions','goal_progress','locale','country_code','time_zone','currency_code',
    'week_starts_on','created_at','updated_at','expires_at']);
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into context_json
  from jsonb_each(case when jsonb_typeof(to_jsonb(owned)->'agent_v2_context')='object' then to_jsonb(owned)->'agent_v2_context' else '{}'::jsonb end)
  where key = any(array['draft','brief','dialogue','memory','summary','dailyCheckIns','feedback',
    'artifactVersions','artifactUpgrade','artifactUpgradeHistory','pendingProjectPlan','goalProgress']);
  session_json := session_json || jsonb_build_object('context',context_json);

  -- New session-linked tables require an explicit export/privacy decision.
  if exists (
    select 1 from pg_constraint fk join pg_class tbl on tbl.oid=fk.conrelid
    join pg_namespace ns on ns.oid=tbl.relnamespace
    where fk.contype='f' and fk.confrelid='public.web_mvp_agent_sessions'::regclass
      and ns.nspname='public' and not (tbl.relname = any(allowed || array['web_mvp_provider_responses','web_mvp_ai_calls']))
  ) then return jsonb_build_object('error','export_schema_changed'); end if;

  foreach relation_name in array allowed loop
    relation_oid := to_regclass('public.' || relation_name);
    if relation_oid is null then
      unavailable := unavailable || jsonb_build_array(relation_name);
    else
      execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from (select * from public.%I where session_id=$1 limit 10001) r',relation_name)
        into rows_json using p_session_id;
      if jsonb_array_length(rows_json)>10000 then return jsonb_build_object('error','export_too_large'); end if;
      collections := collections || jsonb_build_object(relation_name,rows_json);
    end if;
  end loop;
  if to_regclass('public.web_mvp_learning_reviews') is not null and to_regclass('public.web_mvp_diagnostic_reports') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from (select review.* from public.web_mvp_learning_reviews review join public.web_mvp_diagnostic_reports report on report.id=review.diagnostic_report_id where report.session_id=$1 limit 10001) r'
      into rows_json using p_session_id;
    if jsonb_array_length(rows_json)>10000 then return jsonb_build_object('error','export_too_large'); end if;
    collections := collections || jsonb_build_object('web_mvp_learning_reviews',rows_json);
  end if;
  if octet_length(session_json::text)+octet_length(collections::text)>10485760 then
    return jsonb_build_object('error','export_too_large');
  end if;
  return jsonb_build_object('version',1,'sessionId',p_session_id,'exportedAt',statement_timestamp(),
    'session',session_json,'collections',collections,'unavailableCollections',unavailable);
end;
$$;
revoke all on function public.web_mvp_export_owned_session(uuid,text) from public,anon,authenticated;
grant execute on function public.web_mvp_export_owned_session(uuid,text) to service_role;

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
  if not found then
    -- A never-created or already-purged UUID has no live data to delete.
    -- Record revocation under the same creation lock to reject late first writes.
    insert into public.web_mvp_session_tombstones(session_id,token_hash) values(p_session_id,p_token_hash);
    return 'deleted';
  end if;
  if current_session.access_token_hash is null then return 'session_recovery_required'; end if;
  if current_session.access_token_hash <> p_token_hash then return 'session_forbidden'; end if;
  -- Owners may delete even an expired session; never renew or create it here.
  delete from public.web_mvp_agent_sessions where session_id = p_session_id;
  -- Trigger records the tombstone; existing FK cascades delete child data.
  return 'deleted';
end;
$$;
revoke all on function public.web_mvp_delete_owned_session(uuid,text) from public,anon,authenticated;
grant execute on function public.web_mvp_delete_owned_session(uuid,text) to service_role;

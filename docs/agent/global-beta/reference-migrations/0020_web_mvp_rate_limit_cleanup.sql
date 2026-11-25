-- 호출 제한 버킷이 장기간 쌓이지 않도록 만료 인덱스와 점진 정리를 추가한다.

create index web_mvp_rate_limits_updated_idx on public.web_mvp_rate_limits (updated_at);

create or replace function public.web_mvp_consume_rate_limit(
  p_bucket_key text,
  p_now timestamptz,
  p_window_seconds integer,
  p_limit integer
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_bucket public.web_mvp_rate_limits%rowtype;
begin
  if char_length(p_bucket_key) < 8 or p_window_seconds < 1 or p_limit < 1 then
    raise exception 'invalid_rate_limit';
  end if;

  delete from public.web_mvp_rate_limits
  where updated_at < p_now - interval '2 days';

  select * into current_bucket
  from public.web_mvp_rate_limits
  where bucket_key = p_bucket_key
  for update;

  if not found then
    insert into public.web_mvp_rate_limits (bucket_key, window_started_at, request_count, updated_at)
    values (p_bucket_key, p_now, 1, p_now);
    return true;
  end if;

  if p_now >= current_bucket.window_started_at + make_interval(secs => p_window_seconds) then
    update public.web_mvp_rate_limits
    set window_started_at = p_now, request_count = 1, updated_at = p_now
    where bucket_key = p_bucket_key;
    return true;
  end if;

  if current_bucket.request_count >= p_limit then
    return false;
  end if;

  update public.web_mvp_rate_limits
  set request_count = request_count + 1, updated_at = p_now
  where bucket_key = p_bucket_key;
  return true;
end;
$$;

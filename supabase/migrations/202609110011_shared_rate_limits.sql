begin;

create table if not exists public.api_rate_limits (
  bucket_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0
);
alter table public.api_rate_limits enable row level security;
revoke all on public.api_rate_limits from public, anon, authenticated;
grant all on public.api_rate_limits to service_role;

create or replace function public.consume_rate_limit(
  p_key text, p_limit integer, p_window_seconds integer
) returns boolean language plpgsql security invoker set search_path='' as $$
declare current_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 or length(p_key) > 200 then
    raise exception 'Invalid rate limit parameters';
  end if;
  -- Bound stale buckets without retaining identifiers beyond the longest window.
  delete from public.api_rate_limits where bucket_key in (
    select bucket_key from public.api_rate_limits where window_started_at < now()-interval '2 days' limit 100
  );
  insert into public.api_rate_limits(bucket_key, window_started_at, request_count)
  values(p_key, now(), 1)
  on conflict(bucket_key) do update set
    window_started_at = case when public.api_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then now() else public.api_rate_limits.window_started_at end,
    request_count = case when public.api_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1 else public.api_rate_limits.request_count + 1 end
  returning request_count into current_count;
  return current_count <= p_limit;
end $$;
revoke all on function public.consume_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;

commit;

begin;

create table if not exists public.app_user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists app_user_sessions_user_idx
  on public.app_user_sessions(user_id, created_at desc);
alter table public.app_user_sessions enable row level security;
revoke all on public.app_user_sessions from public, anon, authenticated;
grant all on public.app_user_sessions to service_role;

commit;

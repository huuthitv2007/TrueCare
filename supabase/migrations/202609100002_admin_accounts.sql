-- TrueCare account registry and immutable administrative audit trail.
create table if not exists public.employee_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 username text not null,
 username_normalized text generated always as (lower(username)) stored unique,
 display_name text not null,
 role text not null check (role in ('admin','employee')) default 'employee',
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(email)
);
alter table public.employee_accounts enable row level security;
revoke all on public.employee_accounts from anon, authenticated;

create table if not exists public.admin_audit_logs (
 id uuid primary key,
 actor_id uuid not null references auth.users(id),
 target_user_id uuid references auth.users(id) on delete set null,
 action text not null,
 reason text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from anon, authenticated;

create index if not exists admin_audit_logs_created_at_idx on public.admin_audit_logs(created_at desc);
create index if not exists admin_audit_logs_target_idx on public.admin_audit_logs(target_user_id, created_at desc);

-- Soft deletion and idempotent bulk administration.
begin;

alter table public.employee_accounts
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null,
  add column if not exists active_before_delete boolean;

alter table public.products
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create or replace function public.products_sync_deleted_columns()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  new.deleted_at=nullif(new.data->>'deletedAt','')::timestamptz;
  new.deleted_by=nullif(new.data->>'deletedBy','')::uuid;
  return new;
end $$;

drop trigger if exists products_sync_deleted_columns on public.products;
create trigger products_sync_deleted_columns
before insert or update of data on public.products
for each row execute function public.products_sync_deleted_columns();

update public.products set data=data where true;

create table if not exists public.admin_bulk_operations (
  request_id text primary key,
  actor_id uuid not null references auth.users(id),
  resource text not null check(resource in ('customers','orders','products','users')),
  action text not null check(action in ('trash','restore','purge')),
  fingerprint text not null,
  status text not null check(status in ('processing','complete')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists admin_bulk_operations_actor_idx
  on public.admin_bulk_operations(actor_id,created_at desc);

alter table public.admin_bulk_operations enable row level security;
revoke all on public.admin_bulk_operations from public,anon,authenticated;
grant all on public.admin_bulk_operations to service_role;
revoke all on function public.products_sync_deleted_columns() from public,anon,authenticated;
grant execute on function public.products_sync_deleted_columns() to service_role;

commit;

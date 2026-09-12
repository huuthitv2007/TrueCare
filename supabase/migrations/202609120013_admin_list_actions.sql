-- Shared archive visibility; original audit records remain append-only.
begin;
alter table public.admin_bulk_operations drop constraint admin_bulk_operations_resource_check;
alter table public.admin_bulk_operations add constraint admin_bulk_operations_resource_check
  check(resource in ('customers','orders','products','users','inventory','funds','programs','imports','audit'));

create table public.admin_list_archives (
  resource text not null check(resource in ('imports','audit')),
  object_id uuid not null,
  archived_at timestamptz,
  changed_by uuid not null,
  reason text not null check(length(trim(reason)) between 3 and 1000),
  updated_at timestamptz not null default now(),
  primary key(resource,object_id)
);
alter table public.admin_list_archives enable row level security;
revoke all on public.admin_list_archives from public,anon,authenticated;
grant all on public.admin_list_archives to service_role;

create view public.admin_import_list with (security_invoker=true) as
select j.*, a.archived_at from public.admin_import_jobs j
left join public.admin_list_archives a on a.resource='imports' and a.object_id=j.id;
create view public.admin_audit_list with (security_invoker=true) as
select j.*, a.archived_at from public.admin_audit_logs j
left join public.admin_list_archives a on a.resource='audit' and a.object_id=j.id;
revoke all on public.admin_import_list,public.admin_audit_list from public,anon,authenticated;
grant select on public.admin_import_list,public.admin_audit_list to service_role;

create function public.set_admin_list_archive(p_resource text,p_id uuid,p_archived boolean,p_actor uuid,p_reason text,p_key text)
returns void language plpgsql security invoker set search_path='' as $$
declare prior public.admin_list_archives%rowtype;
begin
  if not exists(select 1 from public.employee_accounts where user_id=p_actor and role='admin' and active and deleted_at is null)
    then raise exception 'FORBIDDEN'; end if;
  if p_resource not in ('imports','audit') or length(trim(p_reason)) not between 3 and 1000 or length(p_key)<8
    then raise exception 'INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_resource||':'||p_id::text,0));
  if (p_resource='imports' and not exists(select 1 from public.admin_import_jobs where id=p_id))
    or (p_resource='audit' and not exists(select 1 from public.admin_audit_logs where id=p_id))
    then raise exception 'NOT_FOUND'; end if;
  select * into prior from public.admin_list_archives where resource=p_resource and object_id=p_id;
  if (prior.archived_at is not null)=p_archived then raise exception 'ALREADY_PROCESSED'; end if;
  insert into public.admin_list_archives(resource,object_id,archived_at,changed_by,reason)
    values(p_resource,p_id,case when p_archived then now() end,p_actor,trim(p_reason))
    on conflict(resource,object_id) do update set archived_at=excluded.archived_at,
      changed_by=excluded.changed_by,reason=excluded.reason,updated_at=now();
  insert into public.admin_audit_logs(id,actor_id,action,reason,details,request_id,object_type,object_id,before_data,after_data)
    values(gen_random_uuid(),p_actor,case when p_archived then 'archive_' else 'restore_visibility_' end||p_resource,
      trim(p_reason),'{}',p_key,p_resource,p_id::text,
      jsonb_build_object('archived',prior.archived_at is not null),jsonb_build_object('archived',p_archived));
end $$;
revoke all on function public.set_admin_list_archive(text,uuid,boolean,uuid,text,text) from public,anon,authenticated;
grant execute on function public.set_admin_list_archive(text,uuid,boolean,uuid,text,text) to service_role;

-- Use the same global lock as all workspace commits, then verify reservations
-- across every employee before clearing company stock.
create function public.commit_inventory_clear(
  p_owner uuid,p_expected bigint,p_key text,p_fingerprint text,p_state jsonb,
  p_shared_expected bigint,p_directory jsonb,p_inventory_expected bigint,p_inventory jsonb,
  p_inventory_movements jsonb,p_actor uuid,p_reason text,p_product text
) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.shared_directory where id=true for update;
  perform 1 from public.company_inventory_meta where id=true for update;
  if exists (
    select 1 from public.employee_states s,
      lateral jsonb_array_elements(coalesce(s.state->'orders','[]')) o,
      lateral jsonb_array_elements(coalesce(o->'lines','[]')) l
    where coalesce(o->>'deletedAt','')='' and o->>'status' in ('confirmed','partial')
      and l->>'productId'=p_product and (l->>'quantity')::numeric>coalesce((l->>'delivered')::numeric,0)
  ) or exists (
    select 1 from public.employee_states s,
      lateral jsonb_array_elements(coalesce(s.state->'programs','[]')) p,
      lateral jsonb_array_elements(coalesce(p->'lines','[]')) l
    where p->>'status'='active' and (p->>'guaranteeStock')::boolean
      and (p->>'remaining')::numeric>0 and l->>'productId'=p_product and (l->>'quantity')::numeric>0
  ) then raise exception 'INVENTORY_RESERVED_CONFLICT'; end if;
  return public.commit_workspace_v2(p_owner,p_expected,p_key,p_fingerprint,p_state,p_shared_expected,
    p_directory,p_inventory_expected,p_inventory,p_inventory_movements,p_actor,p_reason);
end $$;
revoke all on function public.commit_inventory_clear(uuid,bigint,text,text,jsonb,bigint,jsonb,bigint,jsonb,jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function public.commit_inventory_clear(uuid,bigint,text,text,jsonb,bigint,jsonb,bigint,jsonb,jsonb,uuid,text,text) to service_role;
commit;

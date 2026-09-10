-- Back up employee_states before applying. All migration and rewrites are transactional.
begin;
create table public.shared_directory (
 id boolean primary key default true check(id),
 version bigint not null default 1,
 data jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.shared_directory enable row level security;
revoke all on public.shared_directory from public,anon,authenticated;
grant all on public.shared_directory to service_role;
-- Workspaces (including trash/audit) are returned only through the authenticated backend.
revoke select on public.employee_states from authenticated;
create function public.migrate_directory_refs(value jsonb,owner text) returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb; k text; v jsonb;
begin
 if jsonb_typeof(value)='array' then
  select coalesce(jsonb_agg(public.migrate_directory_refs(e,owner)),'[]') into result from jsonb_array_elements(value) e;
  return result;
 elsif jsonb_typeof(value)='object' then
  result='{}';
  for k,v in select * from jsonb_each(value) loop
   if k in ('productId','customerId') and jsonb_typeof(v)='string' and v<>'""'::jsonb then
    result=result||jsonb_build_object(k,owner||':'||(v#>>'{}'));
   else result=result||jsonb_build_object(k,public.migrate_directory_refs(v,owner)); end if;
  end loop;
  return result;
 end if;
 return value;
end $$;
insert into public.shared_directory(id,data)
select true,jsonb_build_object(
 'products',coalesce((select jsonb_agg(p||jsonb_build_object('id',s.owner_id::text||':'||(p->>'id'),'sourceOwner',s.owner_id::text,'needsReview',true)) from public.employee_states s cross join lateral jsonb_array_elements(s.state->'products') p),'[]'),
 'customers',coalesce((select jsonb_agg(c||jsonb_build_object('id',s.owner_id::text||':'||(c->>'id'),'legacyLocked',not(c ? 'createdBy' and c ? 'createdAt'))) from public.employee_states s cross join lateral jsonb_array_elements(s.state->'customers') c),'[]'));
update public.employee_states set state=public.migrate_directory_refs(state,owner_id::text)||jsonb_build_object('products','[]'::jsonb,'customers','[]'::jsonb);
drop function public.migrate_directory_refs(jsonb,text);

create or replace function public.commit_workspace_command(p_owner uuid,p_expected bigint,p_key text,p_fingerprint text,p_state jsonb,p_shared_expected bigint,p_directory jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_row public.employee_states%rowtype; common public.shared_directory%rowtype; previous text;
begin
 -- One lock order for every command, so shared and private mutations commit together.
 select * into common from public.shared_directory where id=true for update;
 select * into current_row from public.employee_states where owner_id=p_owner for update;
 if not found then raise exception 'STATE_NOT_FOUND'; end if;
 select fingerprint into previous from public.command_receipts where owner_id=p_owner and command_key=p_key;
 if found then
  if previous<>p_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return current_row.state||common.data||jsonb_build_object('sharedVersion',common.version);
 end if;
 if current_row.version<>p_expected or common.version<>p_shared_expected then raise exception 'VERSION_CONFLICT'; end if;
 if (p_state->>'version')::bigint<>p_expected+1 then raise exception 'INVALID_NEXT_VERSION'; end if;
 if p_directory is not null then
  update public.shared_directory set data=p_directory,version=version+1,updated_at=now() where id=true returning * into common;
 end if;
 update public.employee_states set state=(p_state-'products'-'customers'-'catalogs'-'sharedVersion')||jsonb_build_object('products','[]'::jsonb,'customers','[]'::jsonb),version=p_expected+1,updated_at=now() where owner_id=p_owner;
 insert into public.command_receipts(owner_id,command_key,fingerprint) values(p_owner,p_key,p_fingerprint);
 return p_state||common.data||jsonb_build_object('sharedVersion',common.version);
end $$;
revoke all on function public.commit_workspace_command(uuid,bigint,text,text,jsonb,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.commit_workspace_command(uuid,bigint,text,text,jsonb,bigint,jsonb) to service_role;
-- Keep the legacy RPC during the rolling deploy. It can be revoked after every
-- Render instance runs commit_workspace_command.
commit;

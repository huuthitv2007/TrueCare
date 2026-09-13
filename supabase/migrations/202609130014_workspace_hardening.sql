begin;

create function public.care_search_text(value text) returns text language sql immutable set search_path='' as $$
  select lower(replace(replace(regexp_replace(normalize(coalesce(value,''),NFD),'[̀-ͯ]','','g'),'đ','d'),'Đ','D'))
$$;
revoke all on function public.care_search_text(text) from public,anon,authenticated;
grant execute on function public.care_search_text(text) to service_role;

-- Server-only projections permit filtering/counting/paging without downloading every workspace.
create view public.admin_route_schedule_list as
select s.owner_id,a.display_name as owner_name,s.version as workspace_version,
  d.version as shared_version,i.version as inventory_version,
  item->>'id' as id,item->>'date' as date,item->>'route' as route,
  coalesce(nullif(item->>'routeId',''),case when catalog.matches=1 then catalog.id end) as route_id,
  item->>'status' as status,
  item||jsonb_build_object(
    'routeId',coalesce(nullif(item->>'routeId',''),case when catalog.matches=1 then catalog.id end),
    'needsReview',coalesce((item->>'needsReview')::boolean,false)
      or (coalesce(item->>'routeId','')='' and catalog.matches<>1)
      or (item->>'status'='completed' and jsonb_array_length(coalesce(item->'completedCustomerIds','[]'::jsonb))>0
        and not exists(select 1 from jsonb_array_elements(coalesce(s.state->'visits','[]'::jsonb)) visit where visit->>'scheduleId'=item->>'id'))
  ) as data,
  public.care_search_text(concat_ws(' ',a.display_name,item->>'route',item->>'notes',item->>'resultNotes')) as search_text
from public.employee_states s join public.employee_accounts a on a.user_id=s.owner_id
cross join public.shared_directory d cross join public.company_inventory_meta i
cross join lateral jsonb_array_elements(coalesce(s.state->'routeSchedules','[]'::jsonb)) item
cross join lateral (
  select count(*) as matches,min(entry->>'id') as id
  from jsonb_array_elements(coalesce(d.data->'catalogEntries','[]'::jsonb)) entry
  where entry->>'kind'='routes' and entry->>'value'=item->>'route'
) catalog
where d.id=true and i.id=true and coalesce(item->>'deletedAt','')='';

create view public.admin_attendance_request_list as
select s.owner_id,a.display_name as owner_name,s.version as workspace_version,
  d.version as shared_version,i.version as inventory_version,
  item->>'id' as id,item->>'date' as date,null::text as route,null::text as route_id,
  item->>'status' as status,item as data,
  public.care_search_text(concat_ws(' ',a.display_name,item->>'reason',item->>'reviewReason',item->>'requestedStatus')) as search_text
from public.employee_states s join public.employee_accounts a on a.user_id=s.owner_id
cross join public.shared_directory d cross join public.company_inventory_meta i
cross join lateral jsonb_array_elements(coalesce(s.state->'attendanceRequests','[]'::jsonb)) item
where d.id=true and i.id=true;
revoke all on public.admin_route_schedule_list,public.admin_attendance_request_list from public,anon,authenticated;
grant select on public.admin_route_schedule_list,public.admin_attendance_request_list to service_role;

create table public.app_password_recovery_proofs (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.app_password_recovery_proofs enable row level security;
revoke all on public.app_password_recovery_proofs from public,anon,authenticated;
grant all on public.app_password_recovery_proofs to service_role;
create function public.consume_password_recovery_proof(p_token_hash text,p_user_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare consumed boolean;
begin
  update public.app_password_recovery_proofs proof set consumed_at=now()
  where proof.token_hash=p_token_hash and proof.user_id=p_user_id and proof.consumed_at is null
    and proof.expires_at>now() and exists(
      select 1 from public.employee_accounts a where a.user_id=p_user_id and a.active and a.deleted_at is null)
  returning true into consumed;
  return coalesce(consumed,false);
end $$;
revoke all on function public.consume_password_recovery_proof(text,uuid) from public,anon,authenticated;
grant execute on function public.consume_password_recovery_proof(text,uuid) to service_role;

-- Include schedule arrays and revision snapshots; preserve original identities as provenance.
create or replace function public.replace_customer_reference(value jsonb,source_id text,target_id text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; key text; child jsonb; replaced jsonb;
begin
  if jsonb_typeof(value)='array' then
    select coalesce(jsonb_agg(public.replace_customer_reference(item,source_id,target_id)),'[]'::jsonb)
      into result from jsonb_array_elements(value) item;
    return result;
  elsif jsonb_typeof(value)='object' then
    result='{}'::jsonb;
    for key,child in select * from jsonb_each(value) loop
      if key='customerId' and child=to_jsonb(source_id) then
        result=result||jsonb_build_object(key,target_id);
        if not(value ? 'originalCustomerId') then result=result||jsonb_build_object('originalCustomerId',source_id); end if;
      elsif key in ('customerIds','completedCustomerIds') and jsonb_typeof(child)='array' then
        select coalesce(jsonb_agg(v order by first_position),'[]'::jsonb) into replaced from (
          select case when item=to_jsonb(source_id) then to_jsonb(target_id) else item end v,min(position) first_position
          from jsonb_array_elements(child) with ordinality a(item,position) group by 1
        ) remapped;
        result=result||jsonb_build_object(key,replaced);
        if child<>replaced and not(value ? ('original_'||key)) then result=result||jsonb_build_object('original_'||key,child); end if;
      else
        result=result||jsonb_build_object(key,public.replace_customer_reference(child,source_id,target_id));
      end if;
    end loop;
    return result;
  end if;
  return value;
end $$;

create function public.workspace_references_customer(value jsonb,customer_id text)
returns boolean language plpgsql immutable set search_path='' as $$
declare key text; child jsonb;
begin
  if jsonb_typeof(value)='array' then
    for child in select * from jsonb_array_elements(value) loop
      if public.workspace_references_customer(child,customer_id) then return true; end if;
    end loop;
  elsif jsonb_typeof(value)='object' then
    for key,child in select * from jsonb_each(value) loop
      if key in ('customerId','originalCustomerId') and child=to_jsonb(customer_id) then return true; end if;
      if key in ('customerIds','completedCustomerIds','original_customerIds','original_completedCustomerIds') and child ? customer_id then return true; end if;
      if public.workspace_references_customer(child,customer_id) then return true; end if;
    end loop;
  end if;
  return false;
end $$;
grant execute on function public.replace_customer_reference(jsonb,text,text) to service_role;

-- All workspace commits already lock shared_directory first. A purge under that lock
-- must inspect every employee, not just the admin's currently selected workspace.
create function public.guard_shared_directory_references()
returns trigger language plpgsql security invoker set search_path='' as $$
declare customer jsonb; route_name text; route_id text; entry jsonb;
begin
  for customer in select * from jsonb_array_elements(coalesce(old.data->'customers','[]'::jsonb)) loop
    if not exists(select 1 from jsonb_array_elements(coalesce(new.data->'customers','[]'::jsonb)) c where c->>'id'=customer->>'id')
      and exists(select 1 from public.employee_states s where public.workspace_references_customer(s.state,customer->>'id'))
    then raise exception 'CUSTOMER_REFERENCED'; end if;
  end loop;
  for route_name in select jsonb_array_elements_text(coalesce(old.data->'catalogs'->'routes','[]'::jsonb)) loop
    select c->>'id' into route_id from jsonb_array_elements(coalesce(old.data->'catalogEntries','[]'::jsonb)) c where c->>'kind'='routes' and c->>'value'=route_name limit 1;
    if not(coalesce(new.data->'catalogs'->'routes','[]'::jsonb) ? route_name)
      and not exists(select 1 from jsonb_array_elements(coalesce(new.data->'catalogEntries','[]'::jsonb)) c where route_id is not null and c->>'kind'='routes' and c->>'id'=route_id)
      and exists(select 1 from public.employee_states s cross join lateral jsonb_array_elements(coalesce(s.state->'routeSchedules','[]'::jsonb)) schedule where schedule->>'route'=route_name or (route_id is not null and schedule->>'routeId'=route_id))
    then raise exception 'ROUTE_REFERENCED'; end if;
  end loop;
  for entry in select * from jsonb_array_elements(coalesce(old.data->'catalogEntries','[]'::jsonb)) c where c->>'kind'='routes' loop
    if not exists(select 1 from jsonb_array_elements(coalesce(new.data->'catalogEntries','[]'::jsonb)) c where c->>'kind'='routes' and c->>'id'=entry->>'id')
      and exists(select 1 from public.employee_states s cross join lateral jsonb_array_elements(coalesce(s.state->'routeSchedules','[]'::jsonb)) schedule where schedule->>'routeId'=entry->>'id')
    then raise exception 'ROUTE_REFERENCED'; end if;
  end loop;
  return new;
end $$;
create trigger guard_shared_directory_references before update of data on public.shared_directory
for each row execute function public.guard_shared_directory_references();
revoke all on function public.workspace_references_customer(jsonb,text),public.guard_shared_directory_references() from public,anon,authenticated;
grant execute on function public.workspace_references_customer(jsonb,text),public.guard_shared_directory_references() to service_role;

create or replace function public.admin_merge_customer(
  p_source text,p_target text,p_actor uuid,p_reason text,p_request_id text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare common public.shared_directory%rowtype; next_directory jsonb; now_text text:=now()::text; previous public.customer_merges%rowtype;
begin
  if not exists(select 1 from public.employee_accounts where user_id=p_actor and role='admin' and active and deleted_at is null) then raise exception 'FORBIDDEN'; end if;
  if p_source=p_target then raise exception 'SAME_CUSTOMER'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'REASON_REQUIRED'; end if;
  select * into common from public.shared_directory where id=true for update;
  select * into previous from public.customer_merges where request_id=p_request_id;
  if found then
    if previous.source_customer_id<>p_source or previous.target_customer_id<>p_target then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('duplicate',true);
  end if;
  if not exists(select 1 from jsonb_array_elements(common.data->'customers') item where item->>'id'=p_source and coalesce(item->>'mergedInto','')='')
    or not exists(select 1 from jsonb_array_elements(common.data->'customers') item where item->>'id'=p_target and coalesce(item->>'deletedAt','')='' and coalesce(item->>'mergedInto','')='')
  then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  select jsonb_set(common.data,'{customers}',jsonb_agg(
    case when item->>'id'=p_source then item||jsonb_build_object('archived',true,'mergedInto',p_target,'updatedAt',now_text) else item end
  )) into next_directory from jsonb_array_elements(common.data->'customers') item;
  update public.employee_states set state=public.replace_customer_reference(state,p_source,p_target)||jsonb_build_object('version',version+1),version=version+1,updated_at=now()
  where public.workspace_references_customer(state,p_source);
  update public.shared_directory set data=next_directory,version=version+1,updated_at=now() where id=true;
  perform public.sync_normalized_directory(next_directory,p_actor,p_reason);
  insert into public.customer_merges(source_customer_id,target_customer_id,actor_id,reason,request_id) values(p_source,p_target,p_actor,p_reason,p_request_id);
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.commit_inventory_clear(
  p_owner uuid,p_expected bigint,p_key text,p_fingerprint text,p_state jsonb,
  p_shared_expected bigint,p_directory jsonb,p_inventory_expected bigint,p_inventory jsonb,
  p_inventory_movements jsonb,p_actor uuid,p_reason text,p_product text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare previous text;
begin
  perform 1 from public.shared_directory where id=true for update;
  perform 1 from public.company_inventory_meta where id=true for update;
  select fingerprint into previous from public.command_receipts where owner_id=p_owner and command_key=p_key;
  if found then
    if previous<>p_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('duplicate',true);
  end if;
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
      and coalesce(nullif(left(p->>'expiresAt',10),''),'9999-12-31') >= to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD')
      and (p->>'remaining')::numeric>0 and l->>'productId'=p_product and (l->>'quantity')::numeric>0
  ) then raise exception 'INVENTORY_RESERVED_CONFLICT'; end if;
  return public.commit_workspace_v2(p_owner,p_expected,p_key,p_fingerprint,p_state,p_shared_expected,
    p_directory,p_inventory_expected,p_inventory,p_inventory_movements,p_actor,p_reason);
end $$;
-- Global stock reservations: every caller uses the same shared/inventory locks.
create function public.workspace_stock_reservations(value jsonb)
returns table(product_id text,quantity numeric) language sql stable set search_path='' as $$
  select product_id,sum(quantity) as quantity from (
    select line->>'productId' as product_id,
      greatest(0,coalesce((line->>'quantity')::numeric,0)-coalesce((line->>'delivered')::numeric,0)) as quantity
    from jsonb_array_elements(coalesce(value->'orders','[]'::jsonb)) orders
    cross join lateral jsonb_array_elements(coalesce(orders->'lines','[]'::jsonb)) line
    where orders->>'status' in ('confirmed','partial') and coalesce(orders->>'deletedAt','')=''
    union all
    select line->>'productId',greatest(0,coalesce((line->>'quantity')::numeric,0))*greatest(0,coalesce((program->>'remaining')::numeric,0))
    from jsonb_array_elements(coalesce(value->'programs','[]'::jsonb)) program
    cross join lateral jsonb_array_elements(coalesce(program->'lines','[]'::jsonb)) line
    where program->>'status'='active' and coalesce((program->>'guaranteeStock')::boolean,false)
      and coalesce(nullif(left(program->>'expiresAt',10),''),'9999-12-31')>=to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD')
  ) reservations group by product_id
$$;
revoke all on function public.workspace_stock_reservations(jsonb) from public,anon,authenticated;
grant execute on function public.workspace_stock_reservations(jsonb) to service_role;

create or replace function public.commit_workspace_v2(
  p_owner uuid,
  p_expected bigint,
  p_key text,
  p_fingerprint text,
  p_state jsonb,
  p_shared_expected bigint,
  p_directory jsonb default null,
  p_inventory_expected bigint default null,
  p_inventory jsonb default null,
  p_inventory_movements jsonb default null,
  p_actor uuid default null,
  p_reason text default 'Cập nhật dữ liệu'
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_row public.employee_states%rowtype;
  common public.shared_directory%rowtype;
  stock_meta public.company_inventory_meta%rowtype;
  previous text;
begin
  select * into common from public.shared_directory where id=true for update;
  select * into stock_meta from public.company_inventory_meta where id=true for update;
  select * into current_row from public.employee_states where owner_id=p_owner for update;
  if not found then raise exception 'STATE_NOT_FOUND'; end if;
  select fingerprint into previous from public.command_receipts
    where owner_id=p_owner and command_key=p_key;
  if found then
    if previous<>p_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('duplicate',true);
  end if;
  if current_row.version<>p_expected or common.version<>p_shared_expected then
    raise exception 'VERSION_CONFLICT';
  end if;
  if p_inventory_expected is null or stock_meta.version<>p_inventory_expected then
    raise exception 'INVENTORY_VERSION_CONFLICT';
  end if;
  if (p_state->>'version')::bigint<>p_expected+1 then raise exception 'INVALID_NEXT_VERSION'; end if;

  -- Compare effective shortage, not absolute legacy balance: unrelated attendance
  -- may commit against existing inconsistencies, while no write can worsen them.
  if exists (
    with old_reserved as (
      select r.product_id,sum(r.quantity) as quantity from public.employee_states e
      cross join lateral public.workspace_stock_reservations(e.state) r group by r.product_id
    ), next_reserved as (
      select r.product_id,sum(r.quantity) as quantity from public.employee_states e
      cross join lateral public.workspace_stock_reservations(case when e.owner_id=p_owner then p_state else e.state end) r group by r.product_id
    ), next_inventory as (
      select i.product_id,i.quantity::numeric,i.tracked from public.company_inventory i where p_inventory is null
      union all
      select item->>'productId',coalesce((item->>'quantity')::numeric,0),coalesce((item->>'tracked')::boolean,false)
      from jsonb_array_elements(coalesce(p_inventory,'[]'::jsonb)) item where p_inventory is not null
    ), affected as (
      select product_id from old_reserved union select product_id from next_reserved
      union select product_id from public.company_inventory union select product_id from next_inventory
    )
    select 1 from affected p
    left join old_reserved o on o.product_id=p.product_id
    left join next_reserved n on n.product_id=p.product_id
    left join public.company_inventory old_i on old_i.product_id=p.product_id
    left join next_inventory next_i on next_i.product_id=p.product_id
    where (coalesce(next_i.tracked,false) or (next_i.product_id is null and coalesce(old_i.tracked,false)))
      and greatest(0,coalesce(n.quantity,0)-coalesce(next_i.quantity,0))>
        case when coalesce(old_i.tracked,false) then greatest(0,coalesce(o.quantity,0)-coalesce(old_i.quantity,0)) else 0 end
  ) then raise exception 'INVENTORY_RESERVED_CONFLICT'; end if;
  if p_directory is not null then
    perform public.sync_normalized_directory(p_directory,p_actor,p_reason);
    update public.shared_directory set data=p_directory,version=version+1,updated_at=now() where id=true;
  end if;
  if p_inventory is not null then
    delete from public.company_inventory where true;
    insert into public.company_inventory(product_id,quantity,tracked,updated_at,source)
    select item->>'productId',(item->>'quantity')::integer,
      coalesce((item->>'tracked')::boolean,false),
      coalesce(nullif(item->>'updatedAt','')::timestamptz,now()),coalesce(item->>'source','Kho công ty')
    from jsonb_array_elements(p_inventory) item;
    delete from public.inventory_movements where owner_id=p_owner;
    insert into public.inventory_movements(id,owner_id,product_id,movement_date,quantity,reason,reference_id)
    select item->>'id',p_owner,item->>'productId',(item->>'date')::date,
      (item->>'quantity')::integer,item->>'reason',item->>'referenceId'
    from jsonb_array_elements(coalesce(p_inventory_movements,'[]'::jsonb)) item;
    update public.company_inventory_meta set version=version+1,updated_at=now() where id=true;
  end if;
  update public.employee_states
  set state=(p_state-'products'-'customers'-'catalogs'-'sharedVersion'
    -'inventory'-'inventoryMovements'-'inventoryVersion')
      ||jsonb_build_object('products','[]'::jsonb,'customers','[]'::jsonb,
        'inventory','[]'::jsonb,'inventoryMovements','[]'::jsonb),
    version=p_expected+1,updated_at=now()
  where owner_id=p_owner;
  insert into public.command_receipts(owner_id,command_key,fingerprint)
    values(p_owner,p_key,p_fingerprint);
  return jsonb_build_object('ok',true);
end $$;

commit;

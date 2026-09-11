-- Normalized administration read model and shared company inventory.
-- The legacy shared_directory row is retained during the rolling migration.
begin;

alter table public.employee_accounts
  add column if not exists last_login_at timestamptz;

alter table public.admin_audit_logs
  add column if not exists request_id text,
  add column if not exists object_type text,
  add column if not exists object_id text,
  add column if not exists before_data jsonb,
  add column if not exists after_data jsonb;

create table if not exists public.products (
  id text primary key,
  code text not null default '',
  name text not null,
  archived boolean not null default false,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists products_active_code_idx
  on public.products(lower(code)) where code <> '' and archived = false;

create table if not exists public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  cost numeric(18,2),
  quote_price numeric(18,2),
  pack integer not null check(pack > 0),
  effective_date date not null,
  changed_by uuid references auth.users(id) on delete set null,
  reason text not null default 'Khởi tạo dữ liệu',
  created_at timestamptz not null default now()
);
create index if not exists product_prices_lookup_idx
  on public.product_prices(product_id,effective_date desc,created_at desc);

create table if not exists public.customers (
  id text primary key,
  name text not null,
  phone text not null default '',
  status text not null check(status in ('active','archived','deleted','merged')),
  created_by uuid references auth.users(id) on delete set null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  merged_into text
);
create index if not exists customers_search_idx on public.customers(lower(name),phone,status);

create table if not exists public.customer_merges (
  id uuid primary key default gen_random_uuid(),
  source_customer_id text not null,
  target_customer_id text not null,
  actor_id uuid not null references auth.users(id),
  reason text not null,
  created_at timestamptz not null default now(),
  request_id text unique,
  check(source_customer_id <> target_customer_id)
);

create table if not exists public.catalog_items (
  id text primary key,
  kind text not null,
  value text not null,
  position integer not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(kind, value)
);
create index if not exists catalog_items_kind_idx on public.catalog_items(kind,position);

create table if not exists public.company_inventory_meta (
  id boolean primary key default true check(id),
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.company_inventory_meta(id) values(true) on conflict(id) do nothing;

create table if not exists public.company_inventory (
  product_id text primary key,
  quantity integer not null default 0,
  tracked boolean not null default false,
  updated_at timestamptz not null default now(),
  source text not null default 'Kho công ty'
);

create table if not exists public.inventory_movements (
  id text primary key,
  owner_id uuid references auth.users(id) on delete set null,
  product_id text not null,
  movement_date date not null,
  quantity integer not null,
  reason text not null,
  reference_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists inventory_movements_product_idx
  on public.inventory_movements(product_id,movement_date desc);
create index if not exists inventory_movements_owner_idx
  on public.inventory_movements(owner_id,movement_date desc);

create table if not exists public.admin_import_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  actor_id uuid not null references auth.users(id),
  filename text not null,
  kind text not null,
  status text not null check(status in ('previewed','committed','failed')),
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_system_settings (
  id boolean primary key default true check(id),
  low_stock_threshold integer not null default 12 check(low_stock_threshold >= 0),
  public_registration boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.app_system_settings(id) values(true) on conflict(id) do nothing;

alter table public.products enable row level security;
alter table public.product_prices enable row level security;
alter table public.customers enable row level security;
alter table public.customer_merges enable row level security;
alter table public.catalog_items enable row level security;
alter table public.company_inventory_meta enable row level security;
alter table public.company_inventory enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.admin_import_jobs enable row level security;
alter table public.app_system_settings enable row level security;
revoke all on public.products,public.product_prices,public.customers,
  public.customer_merges,public.catalog_items,public.company_inventory_meta,
  public.company_inventory,public.inventory_movements,public.admin_import_jobs,
  public.app_system_settings from public,anon,authenticated;
grant all on public.products,public.product_prices,public.customers,
  public.customer_merges,public.catalog_items,public.company_inventory_meta,
  public.company_inventory,public.inventory_movements,public.admin_import_jobs,
  public.app_system_settings to service_role;

create or replace function public.sync_normalized_directory(
  p_directory jsonb,
  p_actor uuid default null,
  p_reason text default 'Đồng bộ danh mục'
) returns void language plpgsql security invoker set search_path='' as $$
begin
  insert into public.products(id,code,name,archived,data,created_at,updated_at)
  select item->>'id',coalesce(item->>'code',''),item->>'name',
    coalesce((item->>'archived')::boolean,false),item,now(),now()
  from jsonb_array_elements(coalesce(p_directory->'products','[]'::jsonb)) item
  on conflict(id) do update set code=excluded.code,name=excluded.name,
    archived=excluded.archived,data=excluded.data,updated_at=now();

  insert into public.product_prices(product_id,cost,quote_price,pack,effective_date,changed_by,reason)
  select item->>'id',nullif(item->>'cost','')::numeric,
    nullif(item->>'price','')::numeric,(item->>'pack')::integer,
    (item->>'effectiveDate')::date,p_actor,p_reason
  from jsonb_array_elements(coalesce(p_directory->'products','[]'::jsonb)) item
  where not exists (
    select 1 from public.product_prices pp
    where pp.product_id=item->>'id'
      and pp.cost is not distinct from nullif(item->>'cost','')::numeric
      and pp.quote_price is not distinct from nullif(item->>'price','')::numeric
      and pp.pack=(item->>'pack')::integer
      and pp.effective_date=(item->>'effectiveDate')::date
  );

  delete from public.products p where not exists (
    select 1 from jsonb_array_elements(coalesce(p_directory->'products','[]'::jsonb)) item
    where item->>'id'=p.id
  );

  insert into public.customers(id,name,phone,status,created_by,data,created_at,updated_at,deleted_at,merged_into)
  select item->>'id',item->>'name',coalesce(item->>'phone',''),
    case when item ? 'mergedInto' then 'merged'
         when item ? 'deletedAt' then 'deleted'
         when coalesce((item->>'archived')::boolean,false) then 'archived'
         else 'active' end,
    nullif(item->>'createdBy','')::uuid,item,
    coalesce(nullif(item->>'createdAt','')::timestamptz,now()),
    coalesce(nullif(item->>'updatedAt','')::timestamptz,now()),
    nullif(item->>'deletedAt','')::timestamptz,nullif(item->>'mergedInto','')
  from jsonb_array_elements(coalesce(p_directory->'customers','[]'::jsonb)) item
  on conflict(id) do update set name=excluded.name,phone=excluded.phone,
    status=excluded.status,data=excluded.data,updated_at=excluded.updated_at,
    deleted_at=excluded.deleted_at,merged_into=excluded.merged_into;

  delete from public.customers c where not exists (
    select 1 from jsonb_array_elements(coalesce(p_directory->'customers','[]'::jsonb)) item
    where item->>'id'=c.id
  );

  delete from public.catalog_items;
  insert into public.catalog_items(id,kind,value,position,active)
  select entry.key||':'||md5(valueset.item_value #>> '{}'),entry.key,
    valueset.item_value #>> '{}',valueset.ordinality::integer,true
  from jsonb_each(coalesce(p_directory->'catalogs','{}'::jsonb)) entry
  cross join lateral jsonb_array_elements(entry.value) with ordinality
    as valueset(item_value,ordinality);
end $$;

-- Seed the normalized read model from the current shared directory.
select public.sync_normalized_directory(data,null,'Khởi tạo từ dữ liệu hiện có')
from public.shared_directory where id=true;

create or replace function public.replace_customer_reference(value jsonb,source_id text,target_id text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; key text; child jsonb;
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
      else
        result=result||jsonb_build_object(key,public.replace_customer_reference(child,source_id,target_id));
      end if;
    end loop;
    return result;
  end if;
  return value;
end $$;

create or replace function public.admin_merge_customer(
  p_source text,p_target text,p_actor uuid,p_reason text,p_request_id text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare common public.shared_directory%rowtype; next_directory jsonb; now_text text:=now()::text;
begin
  if p_source=p_target then raise exception 'SAME_CUSTOMER'; end if;
  if length(trim(p_reason))<3 then raise exception 'REASON_REQUIRED'; end if;
  if exists(select 1 from public.customer_merges where request_id=p_request_id) then
    return jsonb_build_object('duplicate',true);
  end if;
  select * into common from public.shared_directory where id=true for update;
  if not exists(select 1 from jsonb_array_elements(common.data->'customers') item where item->>'id'=p_source)
    or not exists(select 1 from jsonb_array_elements(common.data->'customers') item where item->>'id'=p_target and not(item ? 'deletedAt') and not(item ? 'mergedInto'))
  then raise exception 'CUSTOMER_NOT_FOUND'; end if;

  select jsonb_set(common.data,'{customers}',jsonb_agg(
    case when item->>'id'=p_source then item||jsonb_build_object(
      'archived',true,'mergedInto',p_target,'updatedAt',now_text)
    else item end
  )) into next_directory
  from jsonb_array_elements(common.data->'customers') item;

  update public.employee_states
  set state=public.replace_customer_reference(state,p_source,p_target)
      ||jsonb_build_object('version',version+1),
    version=version+1,updated_at=now()
  where state::text like '%'||p_source||'%';
  update public.shared_directory set data=next_directory,version=version+1,updated_at=now() where id=true;
  perform public.sync_normalized_directory(next_directory,p_actor,p_reason);
  insert into public.customer_merges(source_customer_id,target_customer_id,actor_id,reason,request_id)
    values(p_source,p_target,p_actor,p_reason,p_request_id);
  return jsonb_build_object('ok',true);
end $$;

-- Sum existing employee allocations into the new company-wide balance once.
insert into public.company_inventory(product_id,quantity,tracked,updated_at,source)
select item->>'productId',sum((item->>'quantity')::integer)::integer,
  bool_or(coalesce((item->>'tracked')::boolean,false)),now(),'Gộp kho nhân viên'
from public.employee_states s
cross join lateral jsonb_array_elements(coalesce(s.state->'inventory','[]'::jsonb)) item
group by item->>'productId'
on conflict(product_id) do nothing;

insert into public.inventory_movements(id,owner_id,product_id,movement_date,quantity,reason,reference_id)
select item->>'id',s.owner_id,item->>'productId',(item->>'date')::date,
  (item->>'quantity')::integer,item->>'reason',item->>'referenceId'
from public.employee_states s
cross join lateral jsonb_array_elements(coalesce(s.state->'inventoryMovements','[]'::jsonb)) item
on conflict(id) do nothing;

-- Remove private inventory copies after the company balance has been materialized.
update public.employee_states
set state=(state-'inventory'-'inventoryMovements')
  ||jsonb_build_object('inventory','[]'::jsonb,'inventoryMovements','[]'::jsonb);

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

  if p_directory is not null then
    perform public.sync_normalized_directory(p_directory,p_actor,p_reason);
    update public.shared_directory set data=p_directory,version=version+1,updated_at=now() where id=true;
  end if;
  if p_inventory is not null then
    delete from public.company_inventory;
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

revoke all on function public.sync_normalized_directory(jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.replace_customer_reference(jsonb,text,text) from public,anon,authenticated;
revoke all on function public.admin_merge_customer(text,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.commit_workspace_v2(uuid,bigint,text,text,jsonb,bigint,jsonb,bigint,jsonb,jsonb,uuid,text)
  from public,anon,authenticated;
grant execute on function public.sync_normalized_directory(jsonb,uuid,text) to service_role;
grant execute on function public.admin_merge_customer(text,text,uuid,text,text) to service_role;
grant execute on function public.commit_workspace_v2(uuid,bigint,text,text,jsonb,bigint,jsonb,bigint,jsonb,jsonb,uuid,text)
  to service_role;

create or replace function public.prevent_admin_audit_mutation()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'ADMIN_AUDIT_IS_APPEND_ONLY'; end $$;
drop trigger if exists admin_audit_append_only on public.admin_audit_logs;
create trigger admin_audit_append_only before update or delete on public.admin_audit_logs
for each row execute function public.prevent_admin_audit_mutation();

commit;

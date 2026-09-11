-- Keep database safe-update enforcement enabled while allowing reviewed full-table refreshes.
begin;

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

  delete from public.catalog_items where true;
  insert into public.catalog_items(id,kind,value,position,active)
  select entry.key||':'||md5(valueset.item_value #>> '{}'),entry.key,
    valueset.item_value #>> '{}',valueset.ordinality::integer,true
  from jsonb_each(coalesce(p_directory->'catalogs','{}'::jsonb)) entry
  cross join lateral jsonb_array_elements(entry.value) with ordinality
    as valueset(item_value,ordinality);
end $$;

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
revoke all on function public.sync_normalized_directory(jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.commit_workspace_v2(uuid,bigint,text,text,jsonb,bigint,jsonb,bigint,jsonb,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.sync_normalized_directory(jsonb,uuid,text) to service_role;
grant execute on function public.commit_workspace_v2(uuid,bigint,text,text,jsonb,bigint,jsonb,bigint,jsonb,jsonb,uuid,text) to service_role;
commit;

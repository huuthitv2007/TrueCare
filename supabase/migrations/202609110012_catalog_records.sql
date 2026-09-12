-- Preserve catalog identity and active state alongside legacy selection lists.
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
  if p_directory ? 'catalogEntries' then
    insert into public.catalog_items(id,kind,value,position,active)
    select item->>'id',item->>'kind',item->>'value',(item->>'position')::integer,coalesce((item->>'active')::boolean,true)
    from jsonb_array_elements(p_directory->'catalogEntries') item;
  else
    insert into public.catalog_items(id,kind,value,position,active)
    select entry.key||':'||md5(valueset.item_value #>> '{}'),entry.key,
      valueset.item_value #>> '{}',valueset.ordinality::integer-1,true
    from jsonb_each(coalesce(p_directory->'catalogs','{}'::jsonb)) entry
    cross join lateral jsonb_array_elements(entry.value) with ordinality as valueset(item_value,ordinality);
  end if;
end $$;


update public.shared_directory set data=jsonb_set(data,'{catalogEntries}',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'value',value,'position',position,'active',active) order by kind,position) from public.catalog_items),'[]'::jsonb)),version=version+1,updated_at=now()
where id=true and not(data ? 'catalogEntries');
revoke all on function public.sync_normalized_directory(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.sync_normalized_directory(jsonb,uuid,text) to service_role;
commit;

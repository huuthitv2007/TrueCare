-- Customer archiving is retired. Existing archived customers return to the
-- active directory; deleted and merged records retain their lifecycle state.
begin;

do $$
declare
  restored_count integer := 0;
  actor uuid;
begin
  select count(*) into restored_count
  from public.shared_directory directory,
       lateral jsonb_array_elements(coalesce(directory.data->'customers','[]'::jsonb)) customer
  where directory.id = true
    and coalesce((customer->>'archived')::boolean, false)
    and not (customer ? 'deletedAt')
    and not (customer ? 'mergedInto');

  update public.shared_directory directory
  set data = jsonb_set(
        directory.data,
        '{customers}',
        coalesce((
          select jsonb_agg(
            case
              when coalesce((customer->>'archived')::boolean, false)
                and not (customer ? 'deletedAt')
                and not (customer ? 'mergedInto')
              then jsonb_set(
                jsonb_set(customer, '{archived}', 'false'::jsonb, true),
                '{updatedAt}', to_jsonb(now()::text), true
              )
              else customer
            end
          )
          from jsonb_array_elements(coalesce(directory.data->'customers','[]'::jsonb)) customer
        ), '[]'::jsonb),
        true
      ),
      version = directory.version + 1,
      updated_at = now()
  where directory.id = true and restored_count > 0;

  if restored_count > 0 then
    perform public.sync_normalized_directory(directory.data, null, 'Khôi phục khách lưu trữ')
    from public.shared_directory directory where directory.id = true;

    select user_id into actor from public.employee_accounts
      where role = 'admin' and active = true order by created_at limit 1;
    if actor is not null then
      insert into public.admin_audit_logs(
        id, actor_id, action, reason, details, request_id, object_type, after_data
      ) values (
        gen_random_uuid(), actor, 'restore_archived_customers',
        'Migration loại bỏ trạng thái lưu trữ khách hàng',
        jsonb_build_object('restoredCount', restored_count),
        'migration-202609110009', 'customer_migration',
        jsonb_build_object('restoredCount', restored_count)
      );
    end if;
  end if;
end $$;

commit;

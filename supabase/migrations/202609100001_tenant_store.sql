-- Staging foundation. Deploy only after project/email configuration and integration tests.
create table if not exists public.employee_states (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 version bigint not null default 0,
 state jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.employee_states enable row level security;
create policy employee_state_read on public.employee_states for select to authenticated using (auth.uid() = owner_id);
revoke insert,update,delete on public.employee_states from anon, authenticated;
grant select on public.employee_states to authenticated;

create table if not exists public.command_receipts (
 owner_id uuid not null references auth.users(id) on delete cascade,
 command_key text not null,
 fingerprint text not null,
 created_at timestamptz not null default now(),
 primary key(owner_id,command_key)
);
alter table public.command_receipts enable row level security;
revoke all on public.command_receipts from anon,authenticated;

-- Only trusted backend service role may call. Browser cannot submit an arbitrary state.
create or replace function public.commit_employee_command(p_owner uuid,p_expected bigint,p_key text,p_fingerprint text,p_state jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare current_row public.employee_states%rowtype; previous text;
begin
 select * into current_row from public.employee_states where owner_id=p_owner for update;
 if not found then raise exception 'STATE_NOT_FOUND'; end if;
 select fingerprint into previous from public.command_receipts where owner_id=p_owner and command_key=p_key;
 if found then
   if previous<>p_fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   return current_row.state;
 end if;
 if current_row.version<>p_expected then raise exception 'VERSION_CONFLICT'; end if;
 if (p_state->>'version')::bigint<>p_expected+1 then raise exception 'INVALID_NEXT_VERSION'; end if;
 update public.employee_states set state=p_state,version=p_expected+1,updated_at=now() where owner_id=p_owner;
 insert into public.command_receipts(owner_id,command_key,fingerprint) values(p_owner,p_key,p_fingerprint);
 return p_state;
end;
$$;
revoke all on function public.commit_employee_command(uuid,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.commit_employee_command(uuid,bigint,text,text,jsonb) to service_role;

-- Private uploads; object path starts with authenticated owner UUID.
insert into storage.buckets(id,name,public,file_size_limit) values('employee-files','employee-files',false,10485760) on conflict(id) do nothing;
create policy employee_files_read on storage.objects for select to authenticated using(bucket_id='employee-files' and (storage.foldername(name))[1]=auth.uid()::text);
create policy employee_files_insert on storage.objects for insert to authenticated with check(bucket_id='employee-files' and (storage.foldername(name))[1]=auth.uid()::text);
create policy employee_files_delete on storage.objects for delete to authenticated using(bucket_id='employee-files' and (storage.foldername(name))[1]=auth.uid()::text);

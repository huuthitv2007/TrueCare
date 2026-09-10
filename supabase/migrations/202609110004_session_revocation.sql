begin;

alter table public.employee_accounts
  add column if not exists session_valid_after timestamptz not null default '1970-01-01 00:00:00+00';

-- This timestamp is checked by the backend after Supabase validates the JWT.
-- Clients cannot read or change it directly because employee_accounts keeps RLS
-- enabled and grants no privileges to anon/authenticated.
revoke all on public.employee_accounts from anon, authenticated;

commit;

# Supabase staging foundation

Local preview currently runs Express + SQLite, with isolated accounts and atomic persisted commands. It does not connect to Supabase and is not a production deployment.

The migration provides owner RLS, private files, idempotency receipts, and atomic compare-and-swap of validated employee state. `server/supabase-adapter.ts` verifies the JWT with Supabase Auth, executes the same decimal domain validation, and commits with a service-only RPC. Untrusted clients have no write permission on ledger/state or RPC. Concurrent writers cannot spend the same funds: only one expected version succeeds.

Before production: configure Auth email verification/recovery and private login-name mapping; connect HTTP auth to this adapter; configure trusted origin, TLS and secrets on server; run migration/RLS multi-account and race tests against a test project; implement normalized NUMERIC business tables per plan and migrate the staging JSON state; configure backup and verify restore; verify private file signed URLs. None of those external provisioning steps has been performed. Never place a Supabase service key or reference-site credentials in Vite variables.

This foundation intentionally does not claim the planned normalized schema, production Auth flows, or production readiness are complete.

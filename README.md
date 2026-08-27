# MT5 Copy Engine

Secure foundation for a one-master / multi-slave MT5 copier using React, Supabase Auth/Postgres/Realtime, and MQL5. This version deliberately uses zero Supabase Edge Functions.

## Safety status

This repository contains the working tenant/auth/schema/provisioning foundation and a master EA publisher. The MQL5 runtime still needs broker-by-broker validation before any live execution is enabled. `DryRun=true` is the default. Do not connect a funded account until the EA has been tested on a demo account and the slave execution/reconciliation adapter has been validated against that broker.

## Local setup

```sh
cp .env.example .env
npm install
npm run build
```

Set only the publishable browser key in `.env`. Never put a service-role key, database password, or secret key in `.env` variables prefixed `VITE_`, in MQL5 inputs, or in Git.

Apply `supabase/migrations/20260827000000_copy_engine.sql` through the Supabase CLI after linking the project. No Edge Function deployment or service-role secret is needed.

## Security model

Pairing keys are SHA-256 hashed in the database and exchanged once for a revocable device token. Master publishing is enforced by the `publish_master_event` Postgres RPC; changing an EA input cannot grant Master authority. App tables use workspace membership RLS. Live topics are private and the browser subscribes only to workspace monitor topics. Rotate the pairing key and revoke devices after testing.

## Supabase configuration

Disable “Allow public access” for Realtime topics. Configure Auth email confirmation and a strong password policy in the dashboard. The migration intentionally grants no direct access to `pairing_keys`; key operations belong in the validated Postgres RPCs.

## MT5

1. Add `https://<project-ref>.supabase.co` to MT5 Tools → Options → Expert Advisors → WebRequest allow-list.
2. Compile `mt5/CopyEngine/CopyEngine.mq5`.
3. Use a newly generated pairing key on a demo account; provision Master first, then provision a Slave.
4. Keep `DryRun=true` until symbol mapping, volume normalization, stop-level checks, idempotency, and reconciliation have been tested on the exact broker symbols.

The event schema includes sequence numbers, event IDs, execution records and position mappings so the slave adapter can reject duplicates/stale events and report broker errors without silently changing risk.

## Verification

`npm run build` is the frontend type/build gate. Before production, run the SQL migration in a staging Supabase project, test cross-workspace RLS with two users, deploy functions, and perform demo-only OPEN/CLOSE/MODIFY/PARTIAL-CLOSE tests with a disconnected/reconnected terminal.

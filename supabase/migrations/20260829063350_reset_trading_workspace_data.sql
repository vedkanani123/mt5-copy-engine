-- Clean the trading workspace while preserving Supabase Auth users, profiles,
-- workspaces, and memberships so the owner can sign in and start again.
delete from public.audit_logs;
delete from public.trade_executions;
delete from public.commands;
delete from public.copy_group_accounts;
delete from public.position_mappings;
delete from public.symbol_mappings;
delete from public.account_settings;
delete from public.ea_states;
delete from public.ea_devices;
delete from public.heartbeats;
delete from public.pairing_keys;
delete from public.trade_events;
delete from public.copy_groups;
delete from public.trading_accounts;

-- Keep the workspace container for the existing user, but remove any global
-- safety lock left over from the previous test data.
update public.workspaces
set emergency_stop = false;

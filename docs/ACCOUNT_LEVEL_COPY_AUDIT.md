# Account-level copy audit

Scope: one EA on one chart must copy the entire MT5 account.

## A. Already working
- Device auth via `UUID|SECRET` and hashed `ea_devices` credentials
- Copy ON/OFF stored on `trading_accounts.copy_status` (not frontend-only)
- Heartbeat / Algo Trading health for ONLINE vs OFFLINE
- Master publish → command queue → slave poll
- Position list in state is already account-wide (`PositionsTotal`)
- Dashboard COPY SCOPE ticket toggle was removed; one COPY TRADING switch remains

## B. Partially implemented
- `OnTradeTransaction` existed but event IDs were time-based (duplicates after reconnect)
- Symbol mapping used loose `StringFind` (could pick the wrong pair)
- Ticket map lived only in RAM (lost on restart)
- Slave poll was blocked for COPY_* in an earlier migration (fixed)
- Equity-ratio risk did not truly use both equities

## C. Incorrect before this change
- `OnTick` ran the master scanner (chart-tick dependent)
- Direct web orders fell back to `_Symbol` when mapping failed
- Empty symbol coalesced to `XAUUSD` in SQL
- Slave OnTrade is ignored (good), but master could copy its own `Copy #` comments if roles were mixed

## D. Security
- Anon key is in the EA (expected for RPC). Service role is not in the frontend.
- Frontend buttons are not the copy gate; SQL `copy_status` is.
- Do not paste service_role into the EA or React app.

## E. Reliability
- Idempotent event IDs: `{account}|OPEN_MARKET|{position}`
- Slave skips COPY_OPEN if the master ticket is already mapped
- Ticket map persisted to common files
- Timer remains the safety/reconciliation path

## F. Latency
- Fast path: `OnTradeTransaction` → `publish_master_event` → slave `ea_next_command`
- Dashboard is observational, not in the copy path
- Measured latency belongs in `trade_executions.execution_latency_ms` when acks land

## G. Still missing (not silently claimed done)
- Native WebSocket inside MQL5 (HTTP RPC remains the transport; still EA→cloud→EA, not React)
- Full pending-order matrix beyond market deals
- Automatic unsafe reconciliation repairs (unsafe diffs stay logged)

## H. Files changed
- `mt5/CopyEngine/CopyEngine.mq5` v2.50
- `supabase/migrations/20260829133000_account_level_event_identity.sql`
- `src/lib/copy-event-identity.ts`, `symbol-resolver.ts`, `volume-normalizer.ts` + tests

## I. Required live tests after compile
Attach Master EA only to XAUUSD M1. Trade EURUSD, GBPUSD, USDJPY, BTCUSD, ETHUSD, US30, NAS100. Confirm one slave fill per symbol, then SL change, partial close, full close, EA restart with no duplicates.

## J. Production architecture
ONE MASTER EA (any chart) → account-level `OnTradeTransaction` + timer reconcile → authenticated RPC `publish_master_event` → durable `trade_events` + slave `commands` → ONE SLAVE EA (any chart) → symbol resolve → risk/lot → execute → ack. Website observes; it does not copy.

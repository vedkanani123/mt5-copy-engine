export type AccountMode = 'MASTER' | 'SLAVE'
export type ConnectionStatus = 'ONLINE' | 'WARNING' | 'OFFLINE'
export type CopyStatus = 'ACTIVE' | 'PAUSED' | 'DISABLED'
export type TradeStatus = 'RECEIVED' | 'VALIDATING' | 'EXECUTING' | 'EXECUTED' | 'FAILED' | 'SKIPPED'
export type TradeAction = 'OPEN_MARKET' | 'CLOSE_MARKET' | 'PARTIAL_CLOSE' | 'MODIFY_SL' | 'MODIFY_TP' | 'MODIFY_SL_TP' | 'CREATE_PENDING' | 'MODIFY_PENDING' | 'DELETE_PENDING'
export type TradingAccount = { id: string; label: string; broker: string | null; server: string | null; account_number: string | null; mode: AccountMode; connection_status: ConnectionStatus; copy_status: CopyStatus; balance: number; equity: number; last_heartbeat_at: string | null; ea_version: string | null }
export type TradeEvent = { id: string; event_id: string; action: TradeAction; symbol: string; side: string | null; volume: number; sequence_number: number; created_at: string; trade_executions?: { status: TradeStatus; trading_accounts: { label: string } | null; execution_latency_ms: number | null; error_message: string | null }[] }

export type AccountMode = 'MASTER' | 'SLAVE'
export type ConnectionStatus = 'ONLINE' | 'WARNING' | 'OFFLINE'
export type CopyStatus = 'ACTIVE' | 'PAUSED' | 'DISABLED'
export type TradeStatus = 'RECEIVED' | 'VALIDATING' | 'EXECUTING' | 'EXECUTED' | 'FAILED' | 'SKIPPED'
export type TradeAction =
  | 'OPEN_MARKET'
  | 'CLOSE_MARKET'
  | 'PARTIAL_CLOSE'
  | 'MODIFY_SL'
  | 'MODIFY_TP'
  | 'MODIFY_SL_TP'
  | 'CREATE_PENDING'
  | 'MODIFY_PENDING'
  | 'DELETE_PENDING'

export type LotSizingMode = 'MULTIPLIER' | 'FIXED' | 'RISK_PERCENT' | 'RISK_USD' | 'EQUITY_RATIO'

export interface RiskSettings {
  lot: number
  risk_usd: number
  rr: number
  custom_tp: number
  custom_tp_enabled: boolean
  mode?: LotSizingMode
  multiplier?: number
  risk_percent?: number
}

export interface PartialSettings {
  mode: 'safe' | 'advanced'
  partials_on: boolean
  second_on: boolean
  third_on: boolean
  pc1: number
  pc2: number
  pc3: number
}

export interface TradingAccount {
  id: string
  workspace_id?: string
  label: string
  mode: AccountMode
  broker: string | null
  server: string | null
  account_number: string | null
  copy_status: CopyStatus
  connection_status: ConnectionStatus
  balance: number
  equity: number
  open_pl?: number
  open_positions?: number
  symbol?: string
  group_name?: string
  master_account_id?: string | null
  last_heartbeat_at: string | null
  ea_version: string | null
  risk_settings?: RiskSettings
  partial_settings?: PartialSettings
  created_at?: string
  share_settings?: any
}

export interface PositionItem {
  ticket: number | string
  symbol: string
  type: 'BUY' | 'SELL'
  volume: number
  priceOpen: number
  priceCurrent: number
  sl: number
  tp: number
  profit: number
  magic?: number
  time?: number
}

export interface EaStateRow {
  account_id: string
  workspace_id: string
  state: {
    role?: 'MASTER' | 'SLAVE'
    symbol?: string
    balance?: number
    equity?: number
    freeMargin?: number
    openPL?: number
    positionsTotal?: number
    currency?: string
    broker?: string
    server?: string
    accountNumber?: string
    version?: string
    status?: string
    arm?: string
    positions?: PositionItem[]
    spread?: number
    tradeAllowed?: boolean
    terminalConnected?: boolean
    terminalTradeAllowed?: boolean
    algoTradingAllowed?: boolean
    accountTradeAllowed?: boolean
    accountCompany?: string
    accountServer?: string
  }
  updated_at: string
}

export interface CommandRow {
  id: string
  workspace_id: string
  account_id: string
  client_id?: string
  action: string
  payload: any
  status: 'pending' | 'sent' | 'done' | 'failed' | 'expired'
  result_message?: string | null
  created_at: string
  sent_at?: string | null
  done_at?: string | null
  expires_at?: string
}

export interface TradeEvent {
  id: string
  event_id: string
  master_account_id?: string
  master_position_id?: string
  action: string
  symbol: string
  side: string | null
  volume: number
  price?: number | null
  sl?: number | null
  tp?: number | null
  sequence_number: number
  created_at: string
  event_timestamp?: string
  payload?: any
  trade_executions?: {
    status: TradeStatus
    trading_accounts: { label: string } | null
    execution_latency_ms: number | null
    error_message: string | null
  }[]
}

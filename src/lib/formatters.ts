import type { TradingAccount } from './types'

export function formatClock(date?: Date | string | null): string {
  if (!date) return '--:--:--'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatDate(date?: Date | string | null): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function money(v?: number | null, currency = 'USD'): string {
  const num = v ?? 0
  const sign = num > 0 ? '+' : num < 0 ? '-' : ''
  return `${sign}${currency} ${Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function moneyPlain(v?: number | null, currency = 'USD'): string {
  const num = v ?? 0
  return `${currency} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const EA_ONLINE_WINDOW_MS = 15000 // 15 seconds heartbeat window for high-precision online/offline detection

export function parseDateToMs(val?: string | number | Date | null): number | null {
  if (!val) return null
  if (typeof val === 'number') {
    return val > 1e11 ? val : val * 1000
  }
  if (val instanceof Date) {
    const t = val.getTime()
    return Number.isNaN(t) ? null : t
  }
  let s = String(val).trim()
  if (!s) return null

  // Format Postgres timestamp with space to ISO standard, e.g. "2026-08-29 05:17:44.239+00"
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(s)) {
    s = s.replace(' ', 'T')
  }
  if (/[+-]\d{2}$/.test(s)) {
    s = s + ':00'
  }

  const d = new Date(s)
  const t = d.getTime()
  if (!Number.isNaN(t) && t > 0) return t

  const direct = new Date(String(val)).getTime()
  return Number.isNaN(direct) || direct <= 0 ? null : direct
}

/**
 * Accurately determines if an EA terminal is currently ONLINE.
 * Only returns true if a verified heartbeat / state update was received within the last 15 seconds.
 * Robust against clock skew and handles explicit OFFLINE signals.
 */
export function isAccountOnline(
  account?: TradingAccount | null,
  state?: any,
  windowMs: number = EA_ONLINE_WINDOW_MS
): boolean {
  if (!account && !state) return false

  // A fresh heartbeat with trading disabled is intentionally shown as offline.
  // This makes MT5's Algo Trading switch part of the operator-visible health signal.
  if (String(state?.status || '').toUpperCase() === 'OFFLINE') return false
  if (state?.tradeAllowed === false || state?.terminalConnected === false) return false
  if (state?.terminalTradeAllowed === false || state?.algoTradingAllowed === false || state?.accountTradeAllowed === false) return false
  if (!state && account?.connection_status === 'OFFLINE') return false

  const timestamps: number[] = []

  const t1 = parseDateToMs(account?.last_heartbeat_at)
  if (t1) timestamps.push(t1)

  const t2 = parseDateToMs(state?.updated_at)
  if (t2) timestamps.push(t2)

  const t3 = parseDateToMs(state?.last_seen_at)
  if (t3) timestamps.push(t3)

  if (timestamps.length === 0) return false

  const latestTime = Math.max(...timestamps)
  const ageMs = Date.now() - latestTime

  // If latest timestamp was within the last 15 seconds (allowing for minor local/server clock skew), it is ONLINE
  return ageMs >= -60000 && ageMs < windowMs
}

export function clsPL(v?: number | null): string {
  if (!v) return ''
  return v > 0 ? 'pos' : v < 0 ? 'neg' : ''
}

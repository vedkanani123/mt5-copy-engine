import { describe, expect, it, vi } from 'vitest'
import { isAccountOnline } from './formatters'

describe('isAccountOnline', () => {
  it('rejects a stale heartbeat even when the database row still says online', () => {
    vi.setSystemTime(new Date('2026-08-29T00:00:30.000Z'))
    expect(isAccountOnline({ connection_status: 'ONLINE', last_heartbeat_at: '2026-08-29T00:00:00.000Z' } as any, null)).toBe(false)
  })

  it('rejects a fresh heartbeat when MT5 Algo Trading is disabled', () => {
    vi.setSystemTime(new Date('2026-08-29T00:00:05.000Z'))
    expect(isAccountOnline({ connection_status: 'ONLINE', last_heartbeat_at: '2026-08-29T00:00:04.000Z' } as any, {
      updated_at: '2026-08-29T00:00:04.000Z',
      status: 'OFFLINE',
      tradeAllowed: false,
      terminalConnected: true
    })).toBe(false)
  })

  it('rejects a payload that reports the global terminal trade switch as disabled', () => {
    vi.setSystemTime(new Date('2026-08-29T00:00:05.000Z'))
    expect(isAccountOnline({ connection_status: 'ONLINE', last_heartbeat_at: '2026-08-29T00:00:04.000Z' } as any, {
      updated_at: '2026-08-29T00:00:04.000Z',
      status: 'ONLINE',
      tradeAllowed: true,
      terminalConnected: true,
      terminalTradeAllowed: false,
      algoTradingAllowed: true,
      accountTradeAllowed: true
    })).toBe(false)
  })

  it('accepts a fresh healthy terminal heartbeat', () => {
    vi.setSystemTime(new Date('2026-08-29T00:00:05.000Z'))
    expect(isAccountOnline({ connection_status: 'ONLINE', last_heartbeat_at: '2026-08-29T00:00:04.000Z' } as any, {
      updated_at: '2026-08-29T00:00:04.000Z',
      status: 'ONLINE',
      tradeAllowed: true,
      terminalConnected: true
    })).toBe(true)
  })
})

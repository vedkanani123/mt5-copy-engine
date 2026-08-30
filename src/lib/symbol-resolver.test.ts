import { describe, expect, it } from 'vitest'
import { resolveBrokerSymbol, stripBrokerDecorators } from './symbol-resolver'

describe('resolveBrokerSymbol', () => {
  it('uses an exact broker name', () => {
    expect(resolveBrokerSymbol('BTCUSD', ['EURUSD', 'BTCUSD', 'XAUUSD'])).toEqual({
      ok: true,
      symbol: 'BTCUSD'
    })
  })

  it('maps gold aliases without using the chart symbol', () => {
    expect(resolveBrokerSymbol('XAUUSD', ['GOLD', 'EURUSD'])).toEqual({ ok: true, symbol: 'GOLD' })
  })

  it('refuses a loose substring match when two symbols could match', () => {
    const result = resolveBrokerSymbol('USD', ['USDJPY', 'USDCAD', 'EURUSD'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('NOT_FOUND')
  })

  it('maps gold when the slave broker uses a suffix such as XAUUSDc', () => {
    expect(resolveBrokerSymbol('XAUUSD', ['EURUSD', 'XAUUSDc'])).toEqual({
      ok: true,
      symbol: 'XAUUSDc'
    })
  })

  it('picks the shortest gold alias when several decorated names exist', () => {
    expect(resolveBrokerSymbol('XAUUSD', ['XAUUSD.pro', 'GOLD'])).toEqual({
      ok: true,
      symbol: 'GOLD'
    })
  })

  it('prefers an explicit mapping over aliases', () => {
    expect(resolveBrokerSymbol('BTCUSD', ['BTCUSDm', 'BITCOIN'], { BTCUSD: 'BTCUSDm' })).toEqual({
      ok: true,
      symbol: 'BTCUSDm'
    })
  })

  it('normalizes broker suffixes', () => {
    expect(stripBrokerDecorators('XAUUSD.pro')).toBe('XAUUSD')
    expect(stripBrokerDecorators('BTCUSDm')).toBe('BTCUSD')
  })
})

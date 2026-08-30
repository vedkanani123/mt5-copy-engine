import { describe, expect, it } from 'vitest'
import { pickSingleCloseTarget } from './close-target'

const buy = { ticket: 11, symbol: 'XAUUSD', type: 'BUY' as const, comment: '' }
const sell = { ticket: 22, symbol: 'XAUUSD', type: 'SELL' as const, comment: '' }
const copiedBuy = { ticket: 99, symbol: 'GOLD', type: 'BUY' as const, comment: 'Copy #11' }

describe('pickSingleCloseTarget', () => {
  it('closes only the mapped copied buy, not the sell', () => {
    expect(pickSingleCloseTarget([copiedBuy, sell], { ticket: 11, symbol: 'XAUUSD', side: 'BUY' })).toEqual(copiedBuy)
  })

  it('uses side so closing a master buy does not take the sell', () => {
    expect(pickSingleCloseTarget([buy, sell], { symbol: 'XAUUSD', side: 'BUY' })?.ticket).toBe(11)
    expect(pickSingleCloseTarget([buy, sell], { symbol: 'XAUUSD', side: 'SELL' })?.ticket).toBe(22)
  })

  it('does not close every position when side is missing and both exist', () => {
    expect(pickSingleCloseTarget([buy, sell], { symbol: 'XAUUSD' })).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { buildCopyEventId, shouldIgnoreDuplicateEvent } from './copy-event-identity'

describe('buildCopyEventId', () => {
  it('makes one OPEN id per master position, ignoring extra MT5 deal noise', () => {
    const a = buildCopyEventId({
      action: 'OPEN_MARKET',
      masterAccountId: 'master-1',
      positionId: '12345',
      dealId: '1'
    })
    const b = buildCopyEventId({
      action: 'OPEN_MARKET',
      masterAccountId: 'master-1',
      positionId: '12345',
      dealId: '2'
    })
    expect(a).toBe('master-1|OPEN_MARKET|12345')
    expect(shouldIgnoreDuplicateEvent(a, b)).toBe(true)
  })

  it('keeps different symbols/positions as different events', () => {
    const gold = buildCopyEventId({
      action: 'OPEN_MARKET',
      masterAccountId: 'master-1',
      positionId: '100'
    })
    const btc = buildCopyEventId({
      action: 'OPEN_MARKET',
      masterAccountId: 'master-1',
      positionId: '200'
    })
    expect(gold).not.toBe(btc)
  })

  it('treats a later SL/TP change as a new event', () => {
    const first = buildCopyEventId({
      action: 'MODIFY_SL_TP',
      masterAccountId: 'master-1',
      positionId: '100',
      sl: 3300,
      tp: 3400
    })
    const second = buildCopyEventId({
      action: 'MODIFY_SL_TP',
      masterAccountId: 'master-1',
      positionId: '100',
      sl: 3310,
      tp: 3400
    })
    expect(first).not.toBe(second)
  })
})

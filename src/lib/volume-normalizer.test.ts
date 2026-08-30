import { describe, expect, it } from 'vitest'
import { calculateCopiedVolume, normalizeBrokerVolume } from './volume-normalizer'

describe('volume normalizer', () => {
  const bounds = { min: 0.01, max: 5, step: 0.01 }

  it('snaps to broker step and clamps', () => {
    expect(normalizeBrokerVolume(0.123, bounds)).toBeCloseTo(0.12, 8)
    expect(normalizeBrokerVolume(9, bounds)).toBe(5)
    expect(normalizeBrokerVolume(0.001, bounds)).toBe(0.01)
  })

  it('scales by equity ratio instead of copying master lot blindly', () => {
    expect(
      calculateCopiedVolume({
        mode: 'EQUITY_RATIO',
        masterLot: 1,
        masterEquity: 10000,
        slaveEquity: 2500,
        bounds
      })
    ).toBeCloseTo(0.25, 8)
  })

  it('uses a fixed lot when FIXED is selected', () => {
    expect(
      calculateCopiedVolume({
        mode: 'FIXED',
        masterLot: 1,
        fixedLot: 0.05,
        bounds
      })
    ).toBeCloseTo(0.05, 8)
  })

  it('multiplies master lot when MULTIPLIER is selected', () => {
    expect(
      calculateCopiedVolume({
        mode: 'MULTIPLIER',
        masterLot: 1,
        multiplier: 2,
        bounds
      })
    ).toBeCloseTo(2, 8)
  })

  it('sizes from percent of equity when RISK_PERCENT is selected', () => {
    expect(
      calculateCopiedVolume({
        mode: 'RISK_PERCENT',
        masterLot: 1,
        slaveEquity: 10000,
        riskPercent: 1,
        slDistance: 100,
        pointValuePerLot: 1,
        bounds
      })
    ).toBeCloseTo(1, 8)
  })
})

export interface VolumeBounds {
  min: number
  max: number
  step: number
}

export function normalizeBrokerVolume(lot: number, bounds: VolumeBounds): number {
  const step = bounds.step > 0 ? bounds.step : 0.01
  let value = Math.floor(lot / step + 1e-8) * step
  if (value < bounds.min) value = bounds.min
  if (value > bounds.max) value = bounds.max
  return Number(value.toFixed(8))
}

export type LotSizingMode = 'FIXED' | 'MULTIPLIER' | 'RISK_PERCENT' | 'RISK_USD' | 'EQUITY_RATIO' | 'BALANCE_RATIO'

export function calculateCopiedVolume(input: {
  mode: LotSizingMode
  masterLot: number
  multiplier?: number
  fixedLot?: number
  masterEquity?: number
  slaveEquity?: number
  masterBalance?: number
  slaveBalance?: number
  riskUsd?: number
  riskPercent?: number
  slDistance?: number
  pointValuePerLot?: number
  bounds: VolumeBounds
}): number {
  let lot = input.masterLot
  if (input.mode === 'FIXED') {
    lot = input.fixedLot ?? 0.01
  } else if (input.mode === 'MULTIPLIER') {
    lot = input.masterLot * (input.multiplier ?? 1)
  } else if (input.mode === 'EQUITY_RATIO') {
    const masterEq = input.masterEquity ?? 0
    const slaveEq = input.slaveEquity ?? 0
    lot = masterEq > 0 ? input.masterLot * (slaveEq / masterEq) : 0
  } else if (input.mode === 'BALANCE_RATIO') {
    const masterBal = input.masterBalance ?? 0
    const slaveBal = input.slaveBalance ?? 0
    lot = masterBal > 0 ? input.masterLot * (slaveBal / masterBal) : 0
  } else if (input.mode === 'RISK_USD' || input.mode === 'RISK_PERCENT') {
    const money =
      input.mode === 'RISK_PERCENT'
        ? (input.slaveEquity ?? 0) * ((input.riskPercent ?? 1) / 100)
        : (input.riskUsd ?? 0)
    const sl = input.slDistance ?? 0
    const pv = input.pointValuePerLot ?? 0
    lot = sl > 0 && pv > 0 ? money / (sl * pv) : input.fixedLot ?? 0.01
  }
  return normalizeBrokerVolume(lot, input.bounds)
}

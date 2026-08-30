import React from 'react'
import { Minus, Plus } from 'lucide-react'
import type { LotSizingMode } from '../../lib/types'

export interface LotSizingValue {
  mode: LotSizingMode
  lot: number
  multiplier: number
  riskPercent: number
}

export interface LotSizingControlsProps {
  value: LotSizingValue
  onChange: (next: LotSizingValue) => void
}

function stepNumber(val: number, step: number, min: number, decimals: number) {
  return Math.max(min, Number((val + step).toFixed(decimals)))
}

export const LotSizingControls: React.FC<LotSizingControlsProps> = ({ value, onChange }) => {
  const setMode = (mode: LotSizingMode) => onChange({ ...value, mode })

  return (
    <div className="lotSizingControls">
      <span className="fieldLabel">Lot sizing for this account</span>
      <div className="modeToggle accountModeToggle lotModeToggle">
        <button
          type="button"
          className={value.mode === 'FIXED' ? 'active' : ''}
          onClick={() => setMode('FIXED')}
        >
          Fixed lot
        </button>
        <button
          type="button"
          className={value.mode === 'MULTIPLIER' ? 'active' : ''}
          onClick={() => setMode('MULTIPLIER')}
        >
          Multiplier
        </button>
        <button
          type="button"
          className={value.mode === 'RISK_PERCENT' ? 'active successToggle' : ''}
          onClick={() => setMode('RISK_PERCENT')}
        >
          % Risk {value.mode === 'RISK_PERCENT' ? 'ON' : 'OFF'}
        </button>
      </div>

      {value.mode === 'FIXED' && (
        <div className="stepperBlock">
          <span className="fieldLabel">Fixed lot</span>
          <div className="stepperInputGroup">
            <button type="button" className="stepBtn" onClick={() => onChange({ ...value, lot: stepNumber(value.lot, -0.01, 0.01, 2) })}>
              <Minus size={13} />
            </button>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={value.lot}
              onChange={e => onChange({ ...value, lot: Number(e.target.value) })}
              className="stepInput mono"
            />
            <button type="button" className="stepBtn" onClick={() => onChange({ ...value, lot: stepNumber(value.lot, 0.01, 0.01, 2) })}>
              <Plus size={13} />
            </button>
          </div>
          <small className="stepHint">Always trade this lot, ignore master size.</small>
        </div>
      )}

      {value.mode === 'MULTIPLIER' && (
        <div className="stepperBlock">
          <span className="fieldLabel">Master lot multiplier</span>
          <div className="stepperInputGroup">
            <button type="button" className="stepBtn" onClick={() => onChange({ ...value, multiplier: stepNumber(value.multiplier, -0.1, 0.1, 1) })}>
              <Minus size={13} />
            </button>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={value.multiplier}
              onChange={e => onChange({ ...value, multiplier: Number(e.target.value) })}
              className="stepInput mono"
            />
            <button type="button" className="stepBtn" onClick={() => onChange({ ...value, multiplier: stepNumber(value.multiplier, 0.1, 0.1, 1) })}>
              <Plus size={13} />
            </button>
          </div>
          <small className="stepHint">
            {value.multiplier}X — master 1.00 lot becomes {(1 * value.multiplier).toFixed(2)} on this account.
          </small>
        </div>
      )}

      {value.mode === 'RISK_PERCENT' && (
        <div className="stepperBlock">
          <span className="fieldLabel">Risk % of equity</span>
          <div className="stepperInputGroup">
            <button type="button" className="stepBtn" onClick={() => onChange({ ...value, riskPercent: stepNumber(value.riskPercent, -0.1, 0.1, 1) })}>
              <Minus size={13} />
            </button>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={value.riskPercent}
              onChange={e => onChange({ ...value, riskPercent: Number(e.target.value) })}
              className="stepInput mono"
            />
            <button type="button" className="stepBtn" onClick={() => onChange({ ...value, riskPercent: stepNumber(value.riskPercent, 0.1, 0.1, 1) })}>
              <Plus size={13} />
            </button>
          </div>
          <small className="stepHint">Lot is sized so stop-loss risk is {value.riskPercent}% of this account equity.</small>
        </div>
      )}
    </div>
  )
}

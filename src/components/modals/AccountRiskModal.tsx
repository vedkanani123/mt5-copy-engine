import React, { useState } from 'react'
import {
  X,
  Shield,
  SlidersHorizontal,
  Settings2,
  Plus,
  Minus,
  Send,
  Zap,
  TrendingUp,
  DollarSign,
  Layers,
  CheckCircle2,
  Sliders
} from 'lucide-react'
import type { TradingAccount, RiskSettings, PartialSettings } from '../../lib/types'
import { supabase } from '../../lib/supabase'

export interface AccountRiskModalProps {
  account: TradingAccount
  onClose: () => void
  onSendCommand: (action: string, payload?: any, targetIds?: string[]) => void
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onUpdated?: () => void
}

export const AccountRiskModal: React.FC<AccountRiskModalProps> = ({
  account,
  onClose,
  onSendCommand,
  toast,
  onUpdated
}) => {
  const existingRisk = account.risk_settings || {
    lot: 0.01,
    risk_usd: 100,
    rr: 2.0,
    custom_tp: 200,
    custom_tp_enabled: false,
    mode: 'MULTIPLIER',
    multiplier: 1.0
  }

  const existingPartials = (account as any).partial_settings || {
    mode: 'safe',
    partials_on: false,
    second_on: false,
    third_on: false,
    pc1: 33,
    pc2: 33,
    pc3: 34
  }

  // Risk state
  const [lot, setLot] = useState<number>(Number(existingRisk.lot) || 0.01)
  const [riskUsd, setRiskUsd] = useState<number>(Number(existingRisk.risk_usd) || 100)
  const [rr, setRr] = useState<number>(Number(existingRisk.rr) || 2.0)
  const [customTp, setCustomTp] = useState<number>(Number(existingRisk.custom_tp) || 200)
  const [customTpEnabled, setCustomTpEnabled] = useState<boolean>(Boolean(existingRisk.custom_tp_enabled))
  const [multiplier, setMultiplier] = useState<number>(Number(existingRisk.multiplier) || 1.0)
  const [slaveRiskMode, setSlaveRiskMode] = useState<string>(existingRisk.mode || 'MULTIPLIER')
  const [riskPercent, setRiskPercent] = useState<number>(Number(existingRisk.risk_percent) || 1.0)

  // Partials state
  const [executionMode, setExecutionMode] = useState<'safe' | 'advanced'>(existingPartials.mode || 'safe')
  const [partialsOn, setPartialsOn] = useState<boolean>(Boolean(existingPartials.partials_on))
  const [secondOn, setSecondOn] = useState<boolean>(Boolean(existingPartials.second_on))
  const [thirdOn, setThirdOn] = useState<boolean>(Boolean(existingPartials.third_on))
  const [pc1, setPc1] = useState<number>(Number(existingPartials.pc1) || 33)
  const [pc2, setPc2] = useState<number>(Number(existingPartials.pc2) || 33)
  const [pc3, setPc3] = useState<number>(Number(existingPartials.pc3) || 34)

  const [saving, setSaving] = useState<boolean>(false)

  // Stepper helper
  const stepNumber = (val: number, step: number, min = 0.01, decimals = 2) => {
    const next = Math.max(min, Number((val + step).toFixed(decimals)))
    return next
  }

  // Send Risk Settings
  const handleSendRisk = async () => {
    setSaving(true)
    try {
      const payload: RiskSettings = {
        lot,
        risk_usd: riskUsd,
        rr,
        custom_tp: customTp,
        custom_tp_enabled: customTpEnabled,
        mode: slaveRiskMode as any,
        multiplier,
        risk_percent: riskPercent
      }

      // Update database
      const { error } = await supabase
        .from('trading_accounts')
        .update({ risk_settings: payload })
        .eq('id', account.id)

      if (error) throw error

      // Dispatch SET_RISK command to MT5 EA
      onSendCommand('SET_RISK', payload, [account.id])
      toast(`Risk settings sent to ${account.label}.`, 'success')
      if (onUpdated) onUpdated()
    } catch (err: any) {
      toast(`Failed to update risk settings: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Send Custom TP Settings
  const handleSendCustomTp = async () => {
    setSaving(true)
    try {
      const payload = {
        amount: customTp,
        enabled: customTpEnabled
      }

      // Update database
      const updatedRisk = {
        ...existingRisk,
        custom_tp: customTp,
        custom_tp_enabled: customTpEnabled
      }

      await supabase
        .from('trading_accounts')
        .update({ risk_settings: updatedRisk })
        .eq('id', account.id)

      onSendCommand('SET_CUSTOM_TP', payload, [account.id])
      toast(`Custom TP (${customTpEnabled ? `+$${customTp}` : 'OFF'}) sent to ${account.label}.`, 'success')
      if (onUpdated) onUpdated()
    } catch (err: any) {
      toast(`Failed to update Custom TP: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Send Partials & Mode Settings
  const handleSendPartials = async () => {
    setSaving(true)
    try {
      const payload: PartialSettings = {
        mode: executionMode,
        partials_on: partialsOn,
        second_on: secondOn,
        third_on: thirdOn,
        pc1,
        pc2,
        pc3
      }

      // Update database
      const { error } = await supabase
        .from('trading_accounts')
        .update({ partial_settings: payload } as any)
        .eq('id', account.id)

      if (error) throw error

      onSendCommand('SET_PARTIALS', payload, [account.id])
      toast(`Partials & mode settings sent to ${account.label}.`, 'success')
      if (onUpdated) onUpdated()
    } catch (err: any) {
      toast(`Failed to update partial settings: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modalBackdrop animateFadeIn" onClick={onClose}>
      <div
        className="modalContainer riskModalContainer glass animateSlideUp"
        onClick={e => e.stopPropagation()}
      >
        <div className="modalHeader">
          <div className="modalTitleGroup">
            <div className="modalIconBadge textPurple">
              <Settings2 size={20} />
            </div>
            <div>
              <h3>Per-Account Risk Management & Settings</h3>
              <p>Configure and push dedicated execution parameters to <strong>{account.label}</strong> ({account.mode}).</p>
            </div>
          </div>
          <button type="button" className="closeModalBtn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="riskModalBody">
          {/* Subpanel 1: Sizing & Risk Steppers */}
          <div className="riskSubpanel glass">
            <div className="subpanelHeader">
              <div className="subpanelTitle">
                <DollarSign size={16} className="textEmerald" />
                <h4>Lot Sizing & Risk Parameters</h4>
              </div>
              <span className="badgeDim">Live EA Sync</span>
            </div>

            {(account.mode === 'SLAVE' || account.mode === 'MASTER') && (
              <div className="formField" style={{ marginBottom: '14px' }}>
                <label className="fieldLabel">Slave Risk Calculation Mode</label>
                <select
                  value={slaveRiskMode}
                  onChange={e => setSlaveRiskMode(e.target.value)}
                  className="styledSelect fullSelect"
                >
                  <option value="MULTIPLIER">Lot Multiplier (Scale Master Lot)</option>
                  <option value="FIXED">Fixed Lot Size</option>
                  <option value="RISK_PERCENT">Risk % of this account equity</option>
                  <option value="EQUITY_RATIO">Dynamic Equity Ratio (Slave Equity / Master Equity)</option>
                  <option value="RISK_USD">Risk USD Per Trade</option>
                </select>
              </div>
            )}

            <div className="steppersGrid">
              {/* Lot Stepper */}
              <div className="stepperBox">
                <span className="stepperLabel">Base Lot</span>
                <div className="stepperInputRow">
                  <button
                    type="button"
                    className="stepperBtn"
                    onClick={() => setLot(stepNumber(lot, -0.01, 0.01, 2))}
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={lot}
                    onChange={e => setLot(Number(e.target.value))}
                    className="stepperInput mono"
                  />
                  <button
                    type="button"
                    className="stepperBtn"
                    onClick={() => setLot(stepNumber(lot, 0.01, 0.01, 2))}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <small className="stepperSub">+/- 0.01 lot</small>
              </div>

              {/* Risk USD Stepper */}
              <div className="stepperBox">
                <span className="stepperLabel">Risk Amount (USD)</span>
                <div className="stepperInputRow">
                  <button
                    type="button"
                    className="stepperBtn"
                    onClick={() => setRiskUsd(stepNumber(riskUsd, -10, 1, 0))}
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    step="10"
                    min="1"
                    value={riskUsd}
                    onChange={e => setRiskUsd(Number(e.target.value))}
                    className="stepperInput mono"
                  />
                  <button
                    type="button"
                    className="stepperBtn"
                    onClick={() => setRiskUsd(stepNumber(riskUsd, 10, 1, 0))}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <small className="stepperSub">+/- $10 USD</small>
              </div>

              {/* RR Ratio Stepper */}
              <div className="stepperBox">
                <span className="stepperLabel">Risk-to-Reward (RR)</span>
                <div className="stepperInputRow">
                  <button
                    type="button"
                    className="stepperBtn"
                    onClick={() => setRr(stepNumber(rr, -0.1, 0.1, 1))}
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={rr}
                    onChange={e => setRr(Number(e.target.value))}
                    className="stepperInput mono"
                  />
                  <button
                    type="button"
                    className="stepperBtn"
                    onClick={() => setRr(stepNumber(rr, 0.1, 0.1, 1))}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <small className="stepperSub">+/- 0.1 RR</small>
              </div>

              {/* Lot Multiplier Stepper (if Slave) */}
              {slaveRiskMode === 'MULTIPLIER' && (
                <div className="stepperBox">
                  <span className="stepperLabel">Lot Multiplier</span>
                  <div className="stepperInputRow">
                    <button
                      type="button"
                      className="stepperBtn"
                      onClick={() => setMultiplier(stepNumber(multiplier, -0.1, 0.1, 1))}
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={multiplier}
                      onChange={e => setMultiplier(Number(e.target.value))}
                      className="stepperInput mono"
                    />
                    <button
                      type="button"
                      className="stepperBtn"
                      onClick={() => setMultiplier(stepNumber(multiplier, 0.1, 0.1, 1))}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <small className="stepperSub">+/- 0.1x multiplier</small>
                </div>
              )}
              {slaveRiskMode === 'RISK_PERCENT' && (
                <div className="stepperBox">
                  <span className="stepperLabel">Risk % of equity</span>
                  <div className="stepperInputRow">
                    <button
                      type="button"
                      className="stepperBtn"
                      onClick={() => setRiskPercent(stepNumber(riskPercent, -0.1, 0.1, 1))}
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={riskPercent}
                      onChange={e => setRiskPercent(Number(e.target.value))}
                      className="stepperInput mono"
                    />
                    <button
                      type="button"
                      className="stepperBtn"
                      onClick={() => setRiskPercent(stepNumber(riskPercent, 0.1, 0.1, 1))}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <small className="stepperSub">+/- 0.1%</small>
                </div>
              )}
            </div>

            <button
              type="button"
              className="primaryBtn fullBtn"
              onClick={handleSendRisk}
              disabled={saving}
              style={{ marginTop: '14px' }}
            >
              <Send size={15} />
              <span>Send Risk Parameters to EA</span>
            </button>
          </div>

          {/* Subpanel 2: Custom Profit Target (Custom TP) */}
          <div className="riskSubpanel glass">
            <div className="subpanelHeader">
              <div className="subpanelTitle">
                <TrendingUp size={16} className="textCyan" />
                <h4>Custom Profit Exit (Custom TP in USD)</h4>
              </div>
            </div>

            <div className="customTpControlsRow">
              <div className="stepperBox" style={{ flex: 1 }}>
                <span className="stepperLabel">Auto-Close Target ($ USD)</span>
                <div className="stepperInputRow">
                  <button
                    type="button"
                    className="stepperBtn"
                    onClick={() => setCustomTp(stepNumber(customTp, -20, 10, 0))}
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    step="20"
                    min="10"
                    value={customTp}
                    onChange={e => setCustomTp(Number(e.target.value))}
                    className="stepperInput mono"
                  />
                  <button
                    type="button"
                    className="stepperBtn"
                    onClick={() => setCustomTp(stepNumber(customTp, 20, 10, 0))}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              <div className="toggleGroupRow" style={{ flex: 1 }}>
                <span className="stepperLabel">Custom TP Switch</span>
                <div className="dualToggleSwitch">
                  <button
                    type="button"
                    className={`toggleBtn ${!customTpEnabled ? 'activeToggle' : ''}`}
                    onClick={() => setCustomTpEnabled(false)}
                  >
                    OFF
                  </button>
                  <button
                    type="button"
                    className={`toggleBtn ${customTpEnabled ? 'activeToggleSuccess' : ''}`}
                    onClick={() => setCustomTpEnabled(true)}
                  >
                    ON (+$ {customTp})
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="ghostBtn fullBtn"
              onClick={handleSendCustomTp}
              disabled={saving}
              style={{ marginTop: '14px' }}
            >
              <Send size={15} />
              <span>Send Custom TP to EA</span>
            </button>
          </div>

          {/* Subpanel 3: Mode & Partials (PC1, PC2, PC3) */}
          <div className="riskSubpanel glass">
            <div className="subpanelHeader">
              <div className="subpanelTitle">
                <SlidersHorizontal size={16} className="textAmber" />
                <h4>Execution Mode & Multi-Stage Partials</h4>
              </div>
            </div>

            <div className="modeTogglesStrip">
              <button
                type="button"
                className={`modeButton ${executionMode === 'safe' ? 'modeActive' : ''}`}
                onClick={() => setExecutionMode('safe')}
              >
                Safe Mode
              </button>
              <button
                type="button"
                className={`modeButton ${executionMode === 'advanced' ? 'modeActive' : ''}`}
                onClick={() => setExecutionMode('advanced')}
              >
                Advanced Mode
              </button>
              <button
                type="button"
                className={`modeButton ${partialsOn ? 'modeActiveSuccess' : ''}`}
                onClick={() => setPartialsOn(!partialsOn)}
              >
                Partials {partialsOn ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className={`modeButton ${secondOn ? 'modeActiveSuccess' : ''}`}
                onClick={() => setSecondOn(!secondOn)}
              >
                2nd Entry {secondOn ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className={`modeButton ${thirdOn ? 'modeActiveSuccess' : ''}`}
                onClick={() => setThirdOn(!thirdOn)}
              >
                3rd Entry {thirdOn ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="steppersGrid" style={{ marginTop: '14px' }}>
              <div className="stepperBox">
                <span className="stepperLabel">PC1 % Partial</span>
                <div className="stepperInputRow">
                  <button
                    type="button"
                    className="stepperBtn"
                    onClick={() => setPc1(Math.max(0, pc1 - 5))}
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={pc1}
                    onChange={e => setPc1(Number(e.target.value))}
                    className="stepperInput mono"
                  />
                  <button
                    type="button"
                    className="stepperBtn"
                    onClick={() => setPc1(Math.min(100, pc1 + 5))}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              <div className="stepperBox">
                <span className="stepperLabel">PC2 % Partial</span>
                <div className="stepperInputRow">
                  <button
                    type="button"
                    className="stepperBtn"
                    onClick={() => setPc2(Math.max(0, pc2 - 5))}
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={pc2}
                    onChange={e => setPc2(Number(e.target.value))}
                    className="stepperInput mono"
                  />
                  <button
                    type="button"
                    className="stepperBtn"
                    onClick={() => setPc2(Math.min(100, pc2 + 5))}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              <div className="stepperBox">
                <span className="stepperLabel">PC3 % Partial</span>
                <div className="stepperInputRow">
                  <button
                    type="button"
                    className="stepperBtn"
                    onClick={() => setPc3(Math.max(0, pc3 - 5))}
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={pc3}
                    onChange={e => setPc3(Number(e.target.value))}
                    className="stepperInput mono"
                  />
                  <button
                    type="button"
                    className="stepperBtn"
                    onClick={() => setPc3(Math.min(100, pc3 + 5))}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="ghostBtn fullBtn"
              onClick={handleSendPartials}
              disabled={saving}
              style={{ marginTop: '14px' }}
            >
              <Send size={15} />
              <span>Send Partials & Mode to EA</span>
            </button>
          </div>
        </div>

        <div className="modalFooter">
          <button type="button" className="primaryBtn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

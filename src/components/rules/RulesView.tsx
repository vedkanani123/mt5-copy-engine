import React, { useState } from 'react'
import {
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Settings2,
  Zap,
  Lock,
  DollarSign,
  TrendingUp,
  Minus,
  Plus,
  Send,
  Layers,
  Scale
} from 'lucide-react'
import type { TradingAccount, RiskSettings, PartialSettings } from '../../lib/types'
import { StatCard } from '../common/StatCard'
import { supabase } from '../../lib/supabase'

export interface RulesViewProps {
  accounts: TradingAccount[]
  onSendCommand?: (action: string, payload?: any, targetIds?: string[]) => void
  onRefresh?: () => void
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export const RulesView: React.FC<RulesViewProps> = ({
  accounts,
  onSendCommand,
  onRefresh,
  toast
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || '')
  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || accounts[0]

  const existingRisk: RiskSettings = selectedAccount?.risk_settings || {
    lot: 0.01,
    risk_usd: 100,
    rr: 2.0,
    custom_tp: 200,
    custom_tp_enabled: false,
    mode: 'MULTIPLIER',
    multiplier: 1.0
  }

  const existingPartials = (selectedAccount as any)?.partial_settings || {
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

  const handleAccountChange = (id: string) => {
    setSelectedAccountId(id)
    const acc = accounts.find(a => a.id === id)
    if (acc) {
      const r: RiskSettings = acc.risk_settings || {
        lot: 0.01,
        risk_usd: 100,
        rr: 2.0,
        custom_tp: 200,
        custom_tp_enabled: false,
        mode: 'MULTIPLIER',
        multiplier: 1.0
      }
      const p = (acc as any).partial_settings || {}
      setLot(Number(r.lot) || 0.01)
      setRiskUsd(Number(r.risk_usd) || 100)
      setRr(Number(r.rr) || 2.0)
      setCustomTp(Number(r.custom_tp) || 200)
      setCustomTpEnabled(Boolean(r.custom_tp_enabled))
      setMultiplier(Number(r.multiplier) || 1.0)
      setRiskPercent(Number(r.risk_percent) || 1.0)
      setSlaveRiskMode(r.mode || 'MULTIPLIER')
      setExecutionMode(p.mode || 'safe')
      setPartialsOn(Boolean(p.partials_on))
      setSecondOn(Boolean(p.second_on))
      setThirdOn(Boolean(p.third_on))
      setPc1(Number(p.pc1) || 33)
      setPc2(Number(p.pc2) || 33)
      setPc3(Number(p.pc3) || 34)
    }
  }

  // Send Risk Settings
  const handleSendRisk = async () => {
    if (!selectedAccount) return
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

      const { error } = await supabase
        .from('trading_accounts')
        .update({ risk_settings: payload })
        .eq('id', selectedAccount.id)

      if (error) throw error

      if (onSendCommand) {
        onSendCommand('SET_RISK', payload, [selectedAccount.id])
      }
      toast(`Risk parameters dispatched to ${selectedAccount.label}.`, 'success')
      if (onRefresh) onRefresh()
    } catch (err: any) {
      toast(`Failed to update risk settings: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Send Custom TP
  const handleSendCustomTp = async () => {
    if (!selectedAccount) return
    setSaving(true)
    try {
      const payload = { amount: customTp, enabled: customTpEnabled }
      const updatedRisk = { ...existingRisk, custom_tp: customTp, custom_tp_enabled: customTpEnabled }

      await supabase.from('trading_accounts').update({ risk_settings: updatedRisk }).eq('id', selectedAccount.id)

      if (onSendCommand) {
        onSendCommand('SET_CUSTOM_TP', payload, [selectedAccount.id])
      }
      toast(`Custom TP (${customTpEnabled ? `+$${customTp}` : 'OFF'}) sent to ${selectedAccount.label}.`, 'success')
      if (onRefresh) onRefresh()
    } catch (err: any) {
      toast(`Failed to update Custom TP: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Send Partials & Mode
  const handleSendPartials = async () => {
    if (!selectedAccount) return
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

      const { error } = await supabase
        .from('trading_accounts')
        .update({ partial_settings: payload } as any)
        .eq('id', selectedAccount.id)

      if (error) throw error

      if (onSendCommand) {
        onSendCommand('SET_PARTIALS', payload, [selectedAccount.id])
      }
      toast(`Partials & mode sent to ${selectedAccount.label}.`, 'success')
      if (onRefresh) onRefresh()
    } catch (err: any) {
      toast(`Failed to update partial settings: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const masterCount = accounts.filter(a => a.mode === 'MASTER').length
  const slaveCount = accounts.filter(a => a.mode === 'SLAVE').length

  return (
    <div className="rulesPageWrapper">
      {/* Top Stat Overview */}
      <section className="kpiMetricsGrid">
        <StatCard
          icon={<Shield size={20} className="textEmerald" />}
          title="Protected Terminals"
          value={`${accounts.length} Accounts`}
          subtitle={`${masterCount} Masters • ${slaveCount} Slaves`}
        />

        <StatCard
          icon={<ShieldCheck size={20} className="textAccent" />}
          title="Replication Guard"
          value="Sub-50ms"
          subtitle="Real-time Direct MT5 WebSockets"
        />

        <StatCard
          icon={<Scale size={20} className="textCyan" />}
          title="Risk Scaling"
          value="Independent"
          subtitle="Per-Account Custom Risk & Partials"
        />

        <StatCard
          icon={<SlidersHorizontal size={20} className="textPurple" />}
          title="Custom TP & Partials"
          value="Dynamic"
          subtitle="PC1/PC2/PC3 Multi-Stage Close"
        />
      </section>

      {/* Interactive Per-Account Risk Management Console */}
      {selectedAccount && (
        <section className="accountRiskConsoleCard glass animateSlideUp">
          <div className="consoleHeader">
            <div className="consoleHeaderTitle">
              <Settings2 size={20} className="textPurple" />
              <div>
                <h3>Per-Account Risk Management & Execution Console</h3>
                <p>Select any connected Master or Slave account to push dedicated risk and partial settings.</p>
              </div>
            </div>

            <div className="accountPickerDropdown">
              <span className="pickerLabel">Target Account:</span>
              <select
                value={selectedAccount.id}
                onChange={e => handleAccountChange(e.target.value)}
                className="styledSelect"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.mode === 'MASTER' ? '👑' : '⚡'} {acc.label} ({acc.mode}) - {acc.server || 'MT5'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="consoleGrid">
            {/* Risk Steppers */}
            <div className="riskSubpanel glass">
              <div className="subpanelHeader">
                <div className="subpanelTitle">
                  <DollarSign size={16} className="textEmerald" />
                  <h4>Lot Sizing & Risk Parameters</h4>
                </div>
                <span className="badgeDim">{selectedAccount.mode}</span>
              </div>

              <div className="formField" style={{ marginBottom: '14px' }}>
                  <label className="fieldLabel">Lot sizing mode</label>
                  <select
                    value={slaveRiskMode}
                    onChange={e => setSlaveRiskMode(e.target.value)}
                    className="styledSelect fullSelect"
                  >
                    <option value="MULTIPLIER">Lot Multiplier (Scale Master Lot)</option>
                    <option value="FIXED">Fixed Lot Size</option>
                    <option value="RISK_PERCENT">Risk % of this account equity</option>
                    <option value="EQUITY_RATIO">Dynamic Equity Ratio</option>
                    <option value="RISK_USD">Risk USD Per Trade</option>
                  </select>
                </div>

              <div className="steppersGrid">
                <div className="stepperBox">
                  <span className="stepperLabel">Base Lot</span>
                  <div className="stepperInputRow">
                    <button type="button" className="stepperBtn" onClick={() => setLot(stepNumber(lot, -0.01, 0.01, 2))}>
                      <Minus size={14} />
                    </button>
                    <input type="number" step="0.01" min="0.01" value={lot} onChange={e => setLot(Number(e.target.value))} className="stepperInput mono" />
                    <button type="button" className="stepperBtn" onClick={() => setLot(stepNumber(lot, 0.01, 0.01, 2))}>
                      <Plus size={14} />
                    </button>
                  </div>
                  <small className="stepperSub">+/- 0.01 lot</small>
                </div>

                <div className="stepperBox">
                  <span className="stepperLabel">Risk Amount ($ USD)</span>
                  <div className="stepperInputRow">
                    <button type="button" className="stepperBtn" onClick={() => setRiskUsd(stepNumber(riskUsd, -10, 1, 0))}>
                      <Minus size={14} />
                    </button>
                    <input type="number" step="10" min="1" value={riskUsd} onChange={e => setRiskUsd(Number(e.target.value))} className="stepperInput mono" />
                    <button type="button" className="stepperBtn" onClick={() => setRiskUsd(stepNumber(riskUsd, 10, 1, 0))}>
                      <Plus size={14} />
                    </button>
                  </div>
                  <small className="stepperSub">+/- $10 USD</small>
                </div>

                <div className="stepperBox">
                  <span className="stepperLabel">Risk-to-Reward (RR)</span>
                  <div className="stepperInputRow">
                    <button type="button" className="stepperBtn" onClick={() => setRr(stepNumber(rr, -0.1, 0.1, 1))}>
                      <Minus size={14} />
                    </button>
                    <input type="number" step="0.1" min="0.1" value={rr} onChange={e => setRr(Number(e.target.value))} className="stepperInput mono" />
                    <button type="button" className="stepperBtn" onClick={() => setRr(stepNumber(rr, 0.1, 0.1, 1))}>
                      <Plus size={14} />
                    </button>
                  </div>
                  <small className="stepperSub">+/- 0.1 RR</small>
                </div>

                {slaveRiskMode === 'MULTIPLIER' && (
                  <div className="stepperBox">
                    <span className="stepperLabel">Multiplier</span>
                    <div className="stepperInputRow">
                      <button type="button" className="stepperBtn" onClick={() => setMultiplier(stepNumber(multiplier, -0.1, 0.1, 1))}>
                        <Minus size={14} />
                      </button>
                      <input type="number" step="0.1" min="0.1" value={multiplier} onChange={e => setMultiplier(Number(e.target.value))} className="stepperInput mono" />
                      <button type="button" className="stepperBtn" onClick={() => setMultiplier(stepNumber(multiplier, 0.1, 0.1, 1))}>
                        <Plus size={14} />
                      </button>
                    </div>
                    <small className="stepperSub">+/- 0.1x</small>
                  </div>
                )}
                {slaveRiskMode === 'RISK_PERCENT' && (
                  <div className="stepperBox">
                    <span className="stepperLabel">Risk % of equity</span>
                    <div className="stepperInputRow">
                      <button type="button" className="stepperBtn" onClick={() => setRiskPercent(stepNumber(riskPercent, -0.1, 0.1, 1))}>
                        <Minus size={14} />
                      </button>
                      <input type="number" step="0.1" min="0.1" value={riskPercent} onChange={e => setRiskPercent(Number(e.target.value))} className="stepperInput mono" />
                      <button type="button" className="stepperBtn" onClick={() => setRiskPercent(stepNumber(riskPercent, 0.1, 0.1, 1))}>
                        <Plus size={14} />
                      </button>
                    </div>
                    <small className="stepperSub">+/- 0.1%</small>
                  </div>
                )}
              </div>

              <button type="button" className="primaryBtn fullBtn" onClick={handleSendRisk} disabled={saving} style={{ marginTop: '14px' }}>
                <Send size={15} />
                <span>Send Risk to {selectedAccount.label}</span>
              </button>
            </div>

            {/* Custom TP & Partials */}
            <div className="riskSubpanel glass">
              <div className="subpanelHeader">
                <div className="subpanelTitle">
                  <TrendingUp size={16} className="textCyan" />
                  <h4>Custom TP & Multi-Stage Partials</h4>
                </div>
              </div>

              <div className="customTpControlsRow">
                <div className="stepperBox" style={{ flex: 1 }}>
                  <span className="stepperLabel">Auto-Close Profit ($ USD)</span>
                  <div className="stepperInputRow">
                    <button type="button" className="stepperBtn" onClick={() => setCustomTp(stepNumber(customTp, -20, 10, 0))}>
                      <Minus size={14} />
                    </button>
                    <input type="number" step="20" min="10" value={customTp} onChange={e => setCustomTp(Number(e.target.value))} className="stepperInput mono" />
                    <button type="button" className="stepperBtn" onClick={() => setCustomTp(stepNumber(customTp, 20, 10, 0))}>
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                <div className="toggleGroupRow" style={{ flex: 1 }}>
                  <span className="stepperLabel">Custom TP Status</span>
                  <div className="dualToggleSwitch">
                    <button type="button" className={`toggleBtn ${!customTpEnabled ? 'activeToggle' : ''}`} onClick={() => setCustomTpEnabled(false)}>
                      OFF
                    </button>
                    <button type="button" className={`toggleBtn ${customTpEnabled ? 'activeToggleSuccess' : ''}`} onClick={() => setCustomTpEnabled(true)}>
                      ON (+${customTp})
                    </button>
                  </div>
                </div>
              </div>

              <div className="modeTogglesStrip" style={{ marginTop: '14px' }}>
                <button type="button" className={`modeButton ${executionMode === 'safe' ? 'modeActive' : ''}`} onClick={() => setExecutionMode('safe')}>
                  Safe
                </button>
                <button type="button" className={`modeButton ${executionMode === 'advanced' ? 'modeActive' : ''}`} onClick={() => setExecutionMode('advanced')}>
                  Advanced
                </button>
                <button type="button" className={`modeButton ${partialsOn ? 'modeActiveSuccess' : ''}`} onClick={() => setPartialsOn(!partialsOn)}>
                  Partials {partialsOn ? 'ON' : 'OFF'}
                </button>
                <button type="button" className={`modeButton ${secondOn ? 'modeActiveSuccess' : ''}`} onClick={() => setSecondOn(!secondOn)}>
                  2nd {secondOn ? 'ON' : 'OFF'}
                </button>
                <button type="button" className={`modeButton ${thirdOn ? 'modeActiveSuccess' : ''}`} onClick={() => setThirdOn(!thirdOn)}>
                  3rd {thirdOn ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="steppersGrid" style={{ marginTop: '14px' }}>
                <div className="stepperBox">
                  <span className="stepperLabel">PC1 %</span>
                  <input type="number" min="0" max="100" value={pc1} onChange={e => setPc1(Number(e.target.value))} className="stepperInput mono" />
                </div>
                <div className="stepperBox">
                  <span className="stepperLabel">PC2 %</span>
                  <input type="number" min="0" max="100" value={pc2} onChange={e => setPc2(Number(e.target.value))} className="stepperInput mono" />
                </div>
                <div className="stepperBox">
                  <span className="stepperLabel">PC3 %</span>
                  <input type="number" min="0" max="100" value={pc3} onChange={e => setPc3(Number(e.target.value))} className="stepperInput mono" />
                </div>
              </div>

              <div className="dualActionButtonsRow" style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
                <button type="button" className="ghostBtn" style={{ flex: 1 }} onClick={handleSendCustomTp} disabled={saving}>
                  <Send size={14} /> Send Custom TP
                </button>
                <button type="button" className="primaryBtn" style={{ flex: 1 }} onClick={handleSendPartials} disabled={saving}>
                  <Send size={14} /> Send Partials
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Rules & Risk Management Architecture Panels */}
      <div className="rulesGridContainer">
        <div className="rulePanel glass">
          <div className="panelHeader">
            <div className="panelTitle">
              <Zap size={20} className="textAmber" />
              <h3>1. Direct Zero-Lag Replication Guarantee</h3>
            </div>
          </div>
          <p className="panelDescription">
            Unlike slow bot strategies that wait for 1-minute or 5-minute candle closures, this engine replicates every manual market entry, pending order, and stop adjustment directly within milliseconds.
          </p>
          <div className="featureBadgeList">
            <span className="featureBadge">⚡ Sub-millisecond Event Bridge</span>
            <span className="featureBadge">🛡️ Zero Indicator Lag</span>
            <span className="featureBadge">📊 Pure Direct MT5 Execution</span>
          </div>
        </div>

        <div className="rulePanel glass">
          <div className="panelHeader">
            <div className="panelTitle">
              <Lock size={20} className="textAccent" />
              <h3>2. Dynamic Stop Loss & Auto-RR Synchronization</h3>
            </div>
          </div>
          <p className="panelDescription">
            Whenever a Master trader drags or modifies their Stop Loss in MT5 or on this dashboard, all connected slave accounts immediately calculate their respective 1:1, 1:2, or 1:3 RR targets and sync levels.
          </p>
          <div className="featureBadgeList">
            <span className="featureBadge">🎯 1:1, 1:2, 1:3 RR Auto-Targeting</span>
            <span className="featureBadge">🔄 Real-time SL Synchronization</span>
            <span className="featureBadge">⚖️ Automated Break-Even Triggers</span>
          </div>
        </div>

        <div className="rulePanel glass">
          <div className="panelHeader">
            <div className="panelTitle">
              <Layers size={20} className="textPurple" />
              <h3>3. Independent Slave Equity & Lot Sizing</h3>
            </div>
            <span className="badgeDim mono">Per-Account Control</span>
          </div>
          <p className="panelDescription">
            Every slave terminal can maintain its own distinct sizing formula (Fixed Lot, Multiplier, USD Risk Amount, or Dynamic Equity Ratio) without being constrained by the master account's balance.
          </p>
          <div className="featureBadgeList">
            <span className="featureBadge">⚖️ Multiplier (0.1x - 100x)</span>
            <span className="featureBadge">💵 USD Risk Clamping</span>
            <span className="featureBadge">📈 Proportional Equity Sizing</span>
          </div>
        </div>
      </div>
    </div>
  )
}

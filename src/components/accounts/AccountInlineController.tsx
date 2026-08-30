import React, { useState, useEffect } from 'react'
import {
  Settings2,
  SlidersHorizontal,
  Shield,
  Wifi,
  PauseCircle,
  XCircle,
  KeyRound,
  Layers,
  TrendingUp,
  DollarSign,
  Plus,
  Minus,
  Send,
  Radio,
  Clock,
  Gauge
} from 'lucide-react'
import type { TradingAccount, CommandRow, PositionItem, RiskSettings, PartialSettings, LotSizingMode } from '../../lib/types'
import { LotSizingControls } from './LotSizingControls'
import { money, moneyPlain, isAccountOnline, clsPL, formatClock } from '../../lib/formatters'
import { supabase } from '../../lib/supabase'

export interface AccountInlineControllerProps {
  account: TradingAccount
  eaState?: any
  recentCommands: CommandRow[]
  onSendAction: (action: string, payload?: any) => void
  onOpenCredentials?: () => void
  onOpenShareModal?: () => void
  toast?: (msg: string, type?: 'success' | 'error' | 'info') => void
  onRefresh?: () => void
}

export const AccountInlineController: React.FC<AccountInlineControllerProps> = ({
  account,
  eaState,
  recentCommands,
  onSendAction,
  onOpenCredentials,
  onOpenShareModal,
  toast,
  onRefresh
}) => {
  const s = eaState || {}
  const isOnline = isAccountOnline(account, s)
  const balance = s.balance ?? account.balance ?? 0
  const equity = s.equity ?? account.equity ?? 0
  const openPl = s.openPL ?? account.open_pl ?? (equity - balance)
  const positions: PositionItem[] = s.positions ?? []
  const currency = s.currency || 'USD'

  const existingRisk = account.risk_settings || {
    lot: 0.01,
    risk_usd: 100,
    rr: 3.0,
    custom_tp: 200,
    custom_tp_enabled: false,
    mode: 'MULTIPLIER',
    multiplier: 1.0,
    risk_percent: 1.0
  }

  const existingPartials = (account as any).partial_settings || {
    mode: 'safe',
    partials_on: false,
    second_on: false,
    third_on: false,
    pc1: 30,
    pc2: 30,
    pc3: 40
  }

  // Risk state
  const [lot, setLot] = useState<number>(Number(s.lot ?? existingRisk.lot) || 0.01)
  const [riskMoney, setRiskMoney] = useState<number>(Number(s.risk ?? existingRisk.risk_usd) || 100)
  const [rr, setRr] = useState<number>(Number(s.rr ?? existingRisk.rr) || 3.0)
  const [customTpMoney, setCustomTpMoney] = useState<number>(Number(s.customTpAmount ?? existingRisk.custom_tp) || 200)
  const [customTpEnabled, setCustomTpEnabled] = useState<boolean>(Boolean(s.customTpEnabled ?? existingRisk.custom_tp_enabled))
  const [lotMode, setLotMode] = useState<LotSizingMode>(existingRisk.mode || 'MULTIPLIER')
  const [multiplier, setMultiplier] = useState<number>(Number(existingRisk.multiplier) || 1.0)
  const [riskPercent, setRiskPercent] = useState<number>(Number(existingRisk.risk_percent) || 1.0)

  // Partials state
  const [mode, setMode] = useState<'safe' | 'advanced'>(s.advanced ? 'advanced' : existingPartials.mode || 'safe')
  const [partialsOn, setPartialsOn] = useState<boolean>(Boolean(s.partialsOn ?? existingPartials.partials_on))
  const [secondOn, setSecondOn] = useState<boolean>(Boolean(s.secondEntryOn ?? existingPartials.second_on))
  const [thirdOn, setThirdOn] = useState<boolean>(Boolean(s.thirdEntryOn ?? existingPartials.third_on))
  const [pc1, setPc1] = useState<number>(Number(s.pc1 ?? existingPartials.pc1) || 30)
  const [pc2, setPc2] = useState<number>(Number(s.pc2 ?? existingPartials.pc2) || 30)
  const [pc3, setPc3] = useState<number>(Number(s.pc3 ?? existingPartials.pc3) || 40)

  const [busy, setBusy] = useState<string>('')

  // Keep state synchronized with incoming EA state
  useEffect(() => {
    if (s.lot !== undefined) setLot(Number(s.lot) || 0.01)
    if (s.risk !== undefined) setRiskMoney(Number(s.risk) || 100)
    if (s.rr !== undefined) setRr(Number(s.rr) || 3.0)
    if (s.customTpAmount !== undefined) setCustomTpMoney(Number(s.customTpAmount) || 200)
    if (s.customTpEnabled !== undefined) setCustomTpEnabled(Boolean(s.customTpEnabled))
    if (s.advanced !== undefined) setMode(s.advanced ? 'advanced' : 'safe')
    if (s.partialsOn !== undefined) setPartialsOn(Boolean(s.partialsOn))
    if (s.secondEntryOn !== undefined) setSecondOn(Boolean(s.secondEntryOn))
    if (s.thirdEntryOn !== undefined) setThirdOn(Boolean(s.thirdEntryOn))
    if (s.pc1 !== undefined) setPc1(Number(s.pc1) || 30)
    if (s.pc2 !== undefined) setPc2(Number(s.pc2) || 30)
    if (s.pc3 !== undefined) setPc3(Number(s.pc3) || 40)
  }, [s.updated_at])

  // Stepper helper
  const stepNumber = (val: number, step: number, min = 0.01, decimals = 2) => {
    return Math.max(min, Number((val + step).toFixed(decimals)))
  }

  // Send Risk Settings
  const handleSendRisk = async () => {
    setBusy('SET_RISK')
    try {
      const payload: RiskSettings = {
        lot,
        risk_usd: riskMoney,
        rr,
        custom_tp: customTpMoney,
        custom_tp_enabled: customTpEnabled,
        mode: lotMode,
        multiplier,
        risk_percent: riskPercent
      }

      await supabase
        .from('trading_accounts')
        .update({ risk_settings: payload })
        .eq('id', account.id)

      onSendAction('SET_RISK', payload)
      if (toast) toast(`Risk settings sent to ${account.label}.`, 'success')
      if (onRefresh) onRefresh()
    } catch (err: any) {
      if (toast) toast(`Failed to send risk: ${err.message}`, 'error')
    } finally {
      setBusy('')
    }
  }

  // Send Custom TP
  const handleSendCustomTp = async () => {
    setBusy('SET_CUSTOM_TP')
    try {
      const payload = { enabled: customTpEnabled, amount: customTpMoney }

      await supabase
        .from('trading_accounts')
        .update({
          risk_settings: {
            ...existingRisk,
            custom_tp: customTpMoney,
            custom_tp_enabled: customTpEnabled
          }
        })
        .eq('id', account.id)

      onSendAction('SET_CUSTOM_TP', payload)
      if (toast) toast(`Custom TP (${customTpEnabled ? `+$${customTpMoney}` : 'OFF'}) sent to ${account.label}.`, 'success')
      if (onRefresh) onRefresh()
    } catch (err: any) {
      if (toast) toast(`Failed to send Custom TP: ${err.message}`, 'error')
    } finally {
      setBusy('')
    }
  }

  // Send Partials Settings
  const handleSendPartials = async () => {
    setBusy('SET_PARTIALS')
    try {
      const payload: PartialSettings = {
        mode,
        partials_on: partialsOn,
        second_on: secondOn,
        third_on: thirdOn,
        pc1,
        pc2,
        pc3
      }

      await supabase
        .from('trading_accounts')
        .update({ partial_settings: payload } as any)
        .eq('id', account.id)

      onSendAction('SET_PARTIALS', {
        pc1,
        pc2,
        pc3,
        partialsOn,
        secondEntryOn: secondOn,
        thirdEntryOn: thirdOn
      })

      if (toast) toast(`Partials sent to ${account.label}.`, 'success')
      if (onRefresh) onRefresh()
    } catch (err: any) {
      if (toast) toast(`Failed to send partials: ${err.message}`, 'error')
    } finally {
      setBusy('')
    }
  }

  // Toggle Mode (Safe vs Advanced)
  const handleToggleMode = (newMode: 'safe' | 'advanced') => {
    setMode(newMode)
    onSendAction('SET_MODE', { mode: newMode })
    if (toast) toast(`Mode switched to ${newMode.toUpperCase()} on ${account.label}.`, 'info')
  }

  // Toggle Boolean Control (Partials, 2nd, 3rd)
  const handleToggleBoolean = (key: 'partialsOn' | 'secondOn' | 'thirdOn', val: boolean) => {
    if (key === 'partialsOn') {
      setPartialsOn(val)
      onSendAction('SET_PARTIALS', { partialsOn: val })
    } else if (key === 'secondOn') {
      setSecondOn(val)
      onSendAction('SET_PARTIALS', { secondEntryOn: val })
    } else if (key === 'thirdOn') {
      setThirdOn(val)
      onSendAction('SET_PARTIALS', { thirdEntryOn: val })
    }
  }

  const accountCmds = recentCommands.filter(c => c.account_id === account.id).slice(0, 5)

  return (
    <div className="accountInlineControllerWrapper animateFadeIn">
      {/* 1. Top Metrics Quick Bar */}
      <div className="inlineMetricsBar glass">
        <div className="inlineMetricItem">
          <span className="metricItemLabel">Status</span>
          <strong className={`metricItemVal ${isOnline ? 'textEmerald' : 'textRose'}`}>
            {isOnline ? 'Online' : 'Offline'}
          </strong>
        </div>

        <div className="inlineMetricItem">
          <span className="metricItemLabel">Last Seen</span>
          <strong className="metricItemVal mono">
            {s.updated_at ? formatClock(s.updated_at) : isOnline ? 'Just now' : 'Waiting'}
          </strong>
        </div>

        <div className="inlineMetricItem">
          <span className="metricItemLabel">Balance</span>
          <strong className="metricItemVal mono">
            {balance ? moneyPlain(balance, currency) : '--'}
          </strong>
        </div>

        <div className="inlineMetricItem">
          <span className="metricItemLabel">Open P/L</span>
          <strong className={`metricItemVal mono ${clsPL(openPl)}`}>
            {openPl ? money(openPl, currency) : '--'}
          </strong>
        </div>

        <div className="inlineMetricItem">
          <span className="metricItemLabel">Positions</span>
          <strong className="metricItemVal mono">{positions.length}</strong>
        </div>

        <div className="inlineMetricItem">
          <span className="metricItemLabel">Arm</span>
          <strong className="metricItemVal mono">{s.arm || 'OFF'}</strong>
        </div>
      </div>

      {/* 2. Dual Panels: Risk Settings (Left) & Mode & Partials (Right) */}
      <div className="accountControlsGrid">
        {/* Left Panel: Risk Settings */}
        <div className="accountSubpanel glass">
          <div className="subpanelTitle">
            <Settings2 size={16} className="textCyan" />
            <span>Risk Settings</span>
          </div>

          <LotSizingControls
            value={{ mode: lotMode, lot, multiplier, riskPercent }}
            onChange={next => {
              setLotMode(next.mode)
              setLot(next.lot)
              setMultiplier(next.multiplier)
              setRiskPercent(next.riskPercent)
            }}
          />

          <div className="settingsGrid accountSettingsGrid" style={{ marginTop: '12px' }}>

            {/* Risk Money Stepper */}
            <div className="stepperBlock">
              <span className="fieldLabel">Risk Money</span>
              <div className="stepperInputGroup">
                <button
                  type="button"
                  className="stepBtn"
                  onClick={() => setRiskMoney(stepNumber(riskMoney, -1, 1, 2))}
                >
                  <Minus size={13} />
                </button>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={riskMoney}
                  onChange={e => setRiskMoney(Number(e.target.value))}
                  className="stepInput mono"
                />
                <button
                  type="button"
                  className="stepBtn"
                  onClick={() => setRiskMoney(stepNumber(riskMoney, 1, 1, 2))}
                >
                  <Plus size={13} />
                </button>
              </div>
              <small className="stepHint">+/- 1</small>
            </div>

            {/* RR Stepper */}
            <div className="stepperBlock">
              <span className="fieldLabel">RR</span>
              <div className="stepperInputGroup">
                <button
                  type="button"
                  className="stepBtn"
                  onClick={() => setRr(stepNumber(rr, -0.1, 0.1, 1))}
                >
                  <Minus size={13} />
                </button>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={rr}
                  onChange={e => setRr(Number(e.target.value))}
                  className="stepInput mono"
                />
                <button
                  type="button"
                  className="stepBtn"
                  onClick={() => setRr(stepNumber(rr, 0.1, 0.1, 1))}
                >
                  <Plus size={13} />
                </button>
              </div>
              <small className="stepHint">+/- 0.1</small>
            </div>
          </div>

          {/* Custom TP Money Stepper */}
          <div className="customTpStepperRow" style={{ marginTop: '12px' }}>
            <div className="stepperBlock" style={{ flex: 1 }}>
              <span className="fieldLabel">Custom TP Money</span>
              <div className="stepperInputGroup">
                <button
                  type="button"
                  className="stepBtn"
                  onClick={() => setCustomTpMoney(stepNumber(customTpMoney, -10, 10, 0))}
                >
                  <Minus size={13} />
                </button>
                <input
                  type="number"
                  step="10"
                  min="10"
                  value={customTpMoney}
                  onChange={e => setCustomTpMoney(Number(e.target.value))}
                  className="stepInput mono"
                />
                <button
                  type="button"
                  className="stepBtn"
                  onClick={() => setCustomTpMoney(stepNumber(customTpMoney, 10, 10, 0))}
                >
                  <Plus size={13} />
                </button>
              </div>
              <small className="stepHint">+/- 10</small>
            </div>
          </div>

          {/* Custom TP Toggle Switch */}
          <div className="modeToggle accountModeToggle" style={{ marginTop: '10px' }}>
            <button
              type="button"
              className={!customTpEnabled ? 'active' : ''}
              onClick={() => setCustomTpEnabled(false)}
            >
              Custom TP OFF
            </button>
            <button
              type="button"
              className={customTpEnabled ? 'active successToggle' : ''}
              onClick={() => setCustomTpEnabled(true)}
            >
              Custom TP ON
            </button>
          </div>

          <div className="inlineStatus">
            {s.customTpStatus || (customTpEnabled ? `Active - close at +${money(customTpMoney, currency)}` : 'Custom TP OFF')}
          </div>

          <button
            type="button"
            className="primaryBtn fullBtn"
            onClick={handleSendRisk}
            disabled={busy === 'SET_RISK'}
            style={{ marginTop: '12px' }}
          >
            Send Risk To This Account
          </button>

          <button
            type="button"
            className="ghostBtn fullBtn"
            onClick={handleSendCustomTp}
            disabled={busy === 'SET_CUSTOM_TP'}
            style={{ marginTop: '8px' }}
          >
            Send Custom TP
          </button>
        </div>

        {/* Right Panel: Mode & Partials */}
        <div className="accountSubpanel glass">
          <div className="subpanelTitle">
            <SlidersHorizontal size={16} className="textPurple" />
            <span>Mode & Partials</span>
          </div>

          <div className="modeToggle accountModeToggle">
            <button
              type="button"
              className={mode === 'safe' ? 'active' : ''}
              onClick={() => handleToggleMode('safe')}
            >
              Safe
            </button>
            <button
              type="button"
              className={mode === 'advanced' ? 'active' : ''}
              onClick={() => handleToggleMode('advanced')}
            >
              Advanced
            </button>
            <button
              type="button"
              className={partialsOn ? 'active successToggle' : ''}
              onClick={() => handleToggleBoolean('partialsOn', !partialsOn)}
            >
              Partials {partialsOn ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              className={secondOn ? 'active successToggle' : ''}
              onClick={() => handleToggleBoolean('secondOn', !secondOn)}
            >
              2nd {secondOn ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              className={thirdOn ? 'active successToggle' : ''}
              onClick={() => handleToggleBoolean('thirdOn', !thirdOn)}
            >
              3rd {thirdOn ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="inlineStatus">{s.thirdEntryStatus || (thirdOn ? '3rd entry ON' : '3rd entry OFF')}</div>
          <div className="inlineStatus">{s.secondProfitExitStatus || '2nd auto exit waits 3rd'}</div>

          <div className="settingsGrid accountSettingsGrid" style={{ marginTop: '10px' }}>
            {/* PC1 */}
            <div className="stepperBlock">
              <span className="fieldLabel">PC1 %</span>
              <div className="stepperInputGroup">
                <button
                  type="button"
                  className="stepBtn"
                  onClick={() => setPc1(Math.max(0, pc1 - 1))}
                >
                  <Minus size={13} />
                </button>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={pc1}
                  onChange={e => setPc1(Number(e.target.value))}
                  className="stepInput mono"
                />
                <button
                  type="button"
                  className="stepBtn"
                  onClick={() => setPc1(Math.min(100, pc1 + 1))}
                >
                  <Plus size={13} />
                </button>
              </div>
              <small className="stepHint">+/- 1</small>
            </div>

            {/* PC2 */}
            <div className="stepperBlock">
              <span className="fieldLabel">PC2 %</span>
              <div className="stepperInputGroup">
                <button
                  type="button"
                  className="stepBtn"
                  onClick={() => setPc2(Math.max(0, pc2 - 1))}
                >
                  <Minus size={13} />
                </button>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={pc2}
                  onChange={e => setPc2(Number(e.target.value))}
                  className="stepInput mono"
                />
                <button
                  type="button"
                  className="stepBtn"
                  onClick={() => setPc2(Math.min(100, pc2 + 1))}
                >
                  <Plus size={13} />
                </button>
              </div>
              <small className="stepHint">+/- 1</small>
            </div>

            {/* PC3 */}
            <div className="stepperBlock">
              <span className="fieldLabel">PC3 %</span>
              <div className="stepperInputGroup">
                <button
                  type="button"
                  className="stepBtn"
                  onClick={() => setPc3(Math.max(0, pc3 - 1))}
                >
                  <Minus size={13} />
                </button>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={pc3}
                  onChange={e => setPc3(Number(e.target.value))}
                  className="stepInput mono"
                />
                <button
                  type="button"
                  className="stepBtn"
                  onClick={() => setPc3(Math.min(100, pc3 + 1))}
                >
                  <Plus size={13} />
                </button>
              </div>
              <small className="stepHint">+/- 1</small>
            </div>
          </div>

          <button
            type="button"
            className="ghostBtn fullBtn"
            onClick={handleSendPartials}
            disabled={busy === 'SET_PARTIALS'}
            style={{ marginTop: '12px' }}
          >
            Send Partials To This Account
          </button>
        </div>
      </div>

      {/* 3. Account Actions Row */}
      <div className="accountSubpanel accountSafetyPanel glass">
        <div className="subpanelTitle">
          <Shield size={16} className="textEmerald" />
          <span>Account Actions</span>
        </div>
        <div className="accountActionGrid">
          <button
            type="button"
            className="ghostBtn"
            onClick={() => onSendAction('PING')}
          >
            <Wifi size={14} /> Ping
          </button>
          <button
            type="button"
            className="ghostBtn"
            onClick={() => onSendAction('CANCEL')}
          >
            <PauseCircle size={14} /> Cancel
          </button>
          <button
            type="button"
            className="ghostBtn"
            onClick={() => onSendAction('CLOSE_50')}
          >
            <SlidersHorizontal size={14} /> Close 50%
          </button>
          <button
            type="button"
            className="ghostBtn"
            onClick={() => onSendAction('BREAK_EVEN')}
          >
            <Shield size={14} /> BE
          </button>
          <button
            type="button"
            className="ghostBtn"
            onClick={() => onSendAction('FIRST_BREAK_EVEN')}
          >
            <Shield size={14} /> 1st BE
          </button>
          <button
            type="button"
            className="ghostBtn redInlineBtn"
            onClick={() => {
              if (window.confirm(`Close ALL open positions on ${account.label}?`)) {
                onSendAction('CLOSE_ALL')
              }
            }}
          >
            <XCircle size={14} /> Close All
          </button>
        </div>
      </div>

      {/* 4. Mini Positions & Recent Commands */}
      <div className="accountMiniPanelsGrid">
        <div className="accountSubpanel glass">
          <div className="subpanelTitle">
            <Gauge size={16} className="textEmerald" />
            <span>Open Positions ({positions.length})</span>
          </div>
          {positions.length > 0 ? (
            <div className="accountMiniRows">
              {positions.slice(0, 4).map(pos => (
                <div className="accountMiniRow" key={pos.ticket}>
                  <strong className={pos.type === 'BUY' ? 'textEmerald' : 'textRose'}>{pos.type}</strong>
                  <span className="mono">{pos.symbol}</span>
                  <span className="mono">{pos.volume.toFixed(2)} lot</span>
                  <span className={`mono ${clsPL(pos.profit)}`}>{money(pos.profit, currency)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="emptyState compact">No open positions on this account.</div>
          )}
        </div>

        <div className="accountSubpanel glass">
          <div className="subpanelTitle">
            <KeyRound size={16} className="textPurple" />
            <span>Recent Commands</span>
          </div>
          {accountCmds.length > 0 ? (
            <div className="accountMiniRows">
              {accountCmds.map(cmd => (
                <div className="accountMiniRow" key={cmd.id}>
                  <strong>{cmd.action}</strong>
                  <span className={`miniStatusTag tag-${cmd.status}`}>{cmd.status}</span>
                  <span className="mono textDim">{formatClock(cmd.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="emptyState compact">No recent commands sent to this terminal.</div>
          )}
        </div>
      </div>
    </div>
  )
}

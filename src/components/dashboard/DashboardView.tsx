import React, { useState } from 'react'
import {
  Wallet,
  TrendingUp,
  Activity,
  Layers,
  ShieldAlert,
  Zap,
  Radio,
  SlidersHorizontal,
  KeyRound,
  RefreshCw,
  Plus,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Power,
  Share2,
  Settings2
} from 'lucide-react'
import type { TradingAccount, PositionItem, CopyStatus } from '../../lib/types'
import { money, moneyPlain, isAccountOnline, clsPL } from '../../lib/formatters'
import { collectCopyTargets, isCopyOn } from '../../lib/copy-cluster'
import { StatCard } from '../common/StatCard'
import { StatusBadge } from '../common/StatusBadge'
import { OrderTicket } from './OrderTicket'
import { PositionsList } from './PositionsList'

export interface DashboardViewProps {
  account?: TradingAccount
  accounts: TradingAccount[]
  state?: any
  onSelectAccount: (id: string) => void
  onSendAction: (action: string, payload?: any, customTargetIds?: string[]) => void
  onToggleCopyStatus: (accountId: string, newStatus: CopyStatus) => Promise<void>
  onToggleAllSlavesCopyStatus?: (masterId: string, newStatus: CopyStatus) => Promise<void>
  onNewMaster: () => void
  onNewSlave: (masterId?: string) => void
  onOpenCredentials: (acc: TradingAccount) => void
  onOpenRiskModal?: (acc: TradingAccount) => void
  onOpenShareModal?: (acc: TradingAccount) => void
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  account,
  accounts,
  state,
  onSelectAccount,
  onSendAction,
  onToggleCopyStatus,
  onNewMaster,
  onNewSlave,
  onOpenCredentials,
  onOpenRiskModal,
  onOpenShareModal
}) => {
  const [togglingCopy, setTogglingCopy] = useState(false)
  const isOnline = isAccountOnline(account, state)
  const balance = state?.balance ?? account?.balance ?? 0
  const equity = state?.equity ?? account?.equity ?? 0
  const openPl = state?.openPL ?? account?.open_pl ?? (equity - balance)
  const positions: PositionItem[] = state?.positions ?? []
  const symbol = state?.symbol ?? account?.symbol ?? 'XAUUSD'

  // Connected slaves to this master
  const connectedSlaves = accounts.filter(
    a => a.mode === 'SLAVE' && a.master_account_id === account?.id
  )

  const isCopyActive = isCopyOn(account?.copy_status)

  const activeSlavesCount = connectedSlaves.filter(s => isCopyOn(s.copy_status)).length

  const totalPositionsCount = positions.length
  const totalOpenLots = positions.reduce((sum, p) => sum + (p.volume || 0), 0)

  const copyClusterIds = (): string[] => {
    if (!account) return []
    if (account.mode === 'MASTER' && isCopyActive) {
      return [account.id, ...collectCopyTargets(accounts, account.id).map(target => target.id)]
    }
    return [account.id]
  }

  // Direct market execution on the selected terminal. When copy is ON,
  // the same live BUY/SELL is sent to every active linked slave as well.
  const handleExecuteTrade = (side: 'BUY' | 'SELL', payload: any) => {
    const action = side === 'BUY' ? 'BUY' : 'SELL'
    onSendAction(action, { ...payload, side, symbol, volume: payload?.lot ?? payload?.volume }, copyClusterIds())
  }

  const handleQuickAction = (act: string, customTargetIds?: string[]) => {
    const ids = customTargetIds && customTargetIds.length > 0 ? customTargetIds : copyClusterIds()
    if (ids.length > 0) {
      onSendAction(act, { symbol }, ids)
    }
  }

  // Handle Copy Trading Toggle Switch
  const handleToggleCopy = async () => {
    if (!account) return
    setTogglingCopy(true)
    try {
      const nextStatus: CopyStatus = isCopyActive ? 'PAUSED' : 'ACTIVE'
      await onToggleCopyStatus(account.id, nextStatus)
    } finally {
      setTogglingCopy(false)
    }
  }

  if (!account) {
    return (
      <div className="dashboardEmptyPage animateFadeIn">
        <section className="dashboardEmptyHero glass">
          <div className="dashboardEmptyIcon"><Zap size={26} /></div>
          <span className="dashboardEmptyEyebrow">Workspace ready · 0 terminals connected</span>
          <h1>Connect your first MT5 terminal</h1>
          <p>Start with one Master terminal, then add Slaves with individual risk controls. Live health only turns online after a fresh verified EA heartbeat.</p>
          <div className="dashboardEmptyActions">
            <button type="button" className="primaryBtn" onClick={onNewMaster}>
              <Plus size={16} /> Connect Master
            </button>
            <button type="button" className="ghostBtn secondaryBtn" onClick={() => onNewSlave()}>
              <Plus size={16} /> Add Slave
            </button>
          </div>
        </section>

        <section className="dashboardSetupGrid" aria-label="Getting started">
          <div className="dashboardSetupCard glass">
            <span className="dashboardSetupNumber">01</span>
            <Activity size={18} className="textCyan" />
            <h3>Install CopyEngine</h3>
            <p>Compile the current EA in MetaEditor and attach it to your MT5 chart.</p>
          </div>
          <div className="dashboardSetupCard glass">
            <span className="dashboardSetupNumber">02</span>
            <KeyRound size={18} className="textAccent" />
            <h3>Paste one secure key</h3>
            <p>Use the complete <code>ACCOUNT_UUID|SECRET_TOKEN</code> generated here.</p>
          </div>
          <div className="dashboardSetupCard glass">
            <span className="dashboardSetupNumber">03</span>
            <ShieldAlert size={18} className="textEmerald" />
            <h3>Verify health first</h3>
            <p>Keep WebRequest enabled. The terminal must be connected and Algo Trading on.</p>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="dashboardPageWrapper">
      {/* Prominent Copy Trading Master Status Banner */}
      <div className={`copyTradingStatusBanner glass ${isCopyActive ? 'statusActive' : 'statusPaused'} animateFadeIn`}>
        <div className="copyStatusLeft">
          <div className={`powerIconBadge ${isCopyActive ? 'activeGlow' : 'pausedGlow'}`}>
            <Power size={22} />
          </div>
          <div className="copyStatusInfo">
            <div className="copyStatusHeadline">
              <span className="copyStatusLabel">COPY TRADING ENGINE:</span>
              <span className={`copyStatusStateTag ${isCopyActive ? 'tagActive' : 'tagPaused'}`}>
                {isCopyActive ? '● ACTIVE & REPLICATING' : '⏸ PAUSED / STOPPED'}
              </span>
            </div>
            <p className="copyStatusDescription">
              {account?.mode === 'MASTER'
                ? isCopyActive
                  ? `Master is broadcasting every symbol on the account (XAUUSD, BTC, FX, and others). ${activeSlavesCount} of ${connectedSlaves.length} slave(s) are replicating.`
                  : 'Copy trading is OFF. Slaves will not copy new master orders on any symbol.'
                : isCopyActive
                  ? 'This slave copies master trades on the same symbol (BTC stays BTC, gold stays gold).'
                  : 'Copying is paused for this slave. Master orders will be skipped.'}
            </p>
          </div>
        </div>

        <div className="copyStatusRightActions">
          <button
            type="button"
            className={`copyModeSwitch ${isCopyActive ? 'switchOn' : 'switchOff'}`}
            onClick={handleToggleCopy}
            disabled={togglingCopy || !account}
            aria-pressed={isCopyActive}
            title={isCopyActive ? 'Turn copy trading off' : 'Turn copy trading on'}
          >
            <span className="copyModeSwitchTrack"><span className="copyModeSwitchThumb" /></span>
            <span className="copyModeSwitchText">
              <strong>{togglingCopy ? 'Updating…' : isCopyActive ? 'COPY TRADING ON' : 'COPY TRADING OFF'}</strong>
              <small>
                {account.mode === 'MASTER'
                  ? `${connectedSlaves.length} linked slave${connectedSlaves.length === 1 ? '' : 's'}`
                  : isCopyActive
                    ? 'Copying master trades'
                    : 'Copying paused'}
              </small>
            </span>
          </button>
        </div>
      </div>

      {/* Top Aggregated Metric Cards */}
      <section className="kpiMetricsGrid">
        <StatCard
          icon={<Wallet size={20} className="textAccent" />}
          title="Account Balance"
          value={moneyPlain(balance)}
          subtitle={account ? `${account.label} (${account.mode})` : 'No account'}
        />

        <StatCard
          icon={<Activity size={20} className="textCyan" />}
          title="Current Equity"
          value={moneyPlain(equity)}
          subtitle={`Free Margin: ${moneyPlain(state?.freeMargin ?? equity)}`}
        />

        <StatCard
          icon={<TrendingUp size={20} className={openPl >= 0 ? 'textEmerald' : 'textRose'} />}
          title="Floating Net P/L"
          value={money(openPl)}
          trend={openPl > 0 ? 'pos' : openPl < 0 ? 'neg' : 'neutral'}
          subtitle={`${positions.length} active position(s)`}
        />

        <StatCard
          icon={<Layers size={20} className="textPurple" />}
          title="Copier Network"
          value={`${connectedSlaves.length} Slaves`}
          subtitle={`${activeSlavesCount} active copier(s)`}
          badge={isOnline ? (isCopyActive ? 'Copying Active' : 'Copying Paused') : 'Offline'}
        />
      </section>

      {/* Main Terminal Grid: Left Controls & Right Orders/Positions */}
      <div className="terminalMainGrid">
        {/* Left Column: Account Overview & Fast Cluster Controls */}
        <div className="terminalControlColumn">
          {/* Account Identity & Connection Card */}
          <div className="accountIdentityCard glass">
            <div className="accountIdentityHeader">
              <div className="accountTitleGroup">
                <div className="accountRoleBadge">
                  {account?.mode === 'MASTER' ? '👑 Master Terminal' : '⚡ Slave Copier'}
                </div>
                <h2 className="accountNameHeading">{account?.label || 'Select Account'}</h2>
                <div className="accountSubMeta">
                  <span>{account?.broker || 'MT5 Broker'}</span>
                  <span>•</span>
                  <span>{account?.server || 'Live Server'}</span>
                  {account?.account_number && (
                    <>
                      <span>•</span>
                      <span className="mono">#{account.account_number}</span>
                    </>
                  )}
                </div>
              </div>
              <StatusBadge online={isOnline} pingMs={state?.spread ? Math.round(state.spread * 10) : undefined} />
            </div>

            <div className="accountQuickMetaGrid">
              <div className="metaBox">
                <span className="metaLabel">Active Symbol</span>
                <strong className="metaVal mono">{symbol}</strong>
              </div>
              <div className="metaBox">
                <span className="metaLabel">Copy Status</span>
                <strong className={`metaVal mono ${isCopyActive ? 'posText' : 'textAmber'}`}>
                  {isCopyActive ? 'ACTIVE (ON)' : 'PAUSED (OFF)'}
                </strong>
              </div>
              <div className="metaBox">
                <span className="metaLabel">Open Volume</span>
                <strong className="metaVal mono">{totalOpenLots.toFixed(2)} Lots</strong>
              </div>
              <div className="metaBox">
                <span className="metaLabel">Slave Nodes</span>
                <strong className="metaVal mono">{connectedSlaves.length} Linked</strong>
              </div>
            </div>

            <div className="accountCardBottomActions">
              {account && (
                <>
                  <button
                    type="button"
                    className="ghostBtn secondaryBtn"
                    onClick={() => onOpenCredentials(account)}
                  >
                    <KeyRound size={15} />
                    <span>1-Click Key</span>
                  </button>
                  <button
                    type="button"
                    className="ghostBtn secondaryBtn"
                    onClick={() => onOpenRiskModal && onOpenRiskModal(account)}
                  >
                    <Settings2 size={15} />
                    <span>Risk & Rules</span>
                  </button>
                  <button
                    type="button"
                    className="ghostBtn secondaryBtn"
                    onClick={() => onOpenShareModal && onOpenShareModal(account)}
                  >
                    <Share2 size={15} />
                    <span>Share Account</span>
                  </button>
                </>
              )}
              <button
                type="button"
                className="ghostBtn secondaryBtn"
                onClick={() => onNewSlave(account?.id)}
              >
                <Plus size={15} />
                <span>Add Slave</span>
              </button>
            </div>
          </div>

          {/* Rapid Cluster Action Deck */}
          <div className="rapidActionsCard glass">
            <div className="cardHeader">
              <div className="cardHeaderTitle">
                <Flame size={18} className="textAmber" />
                <h3>Fast Cluster Action Deck</h3>
              </div>
              <span className="badgeDim">1-Click Dispatch</span>
            </div>

            <div className="rapidButtonsGrid">
              <button
                type="button"
                className="rapidActionBtn beAction"
                onClick={() => handleQuickAction('FIRST_BREAK_EVEN')}
                title="Move all positions on this terminal & slaves to Break Even"
              >
                <ShieldAlert size={16} />
                <span>Move to Break-Even</span>
              </button>

              <button
                type="button"
                className="rapidActionBtn partialAction"
                onClick={() => handleQuickAction('CLOSE_50')}
                title="Close 50% partial on all positions"
              >
                <SlidersHorizontal size={16} />
                <span>Close 50% Partial</span>
              </button>

              <button
                type="button"
                className="rapidActionBtn dangerCloseAllAction"
                onClick={() => {
                  if (window.confirm('Are you sure you want to CLOSE ALL open positions on this account and all connected slaves?')) {
                    handleQuickAction('CLOSE_ALL')
                  }
                }}
                title="Emergency close all open positions"
              >
                <AlertTriangle size={16} />
                <span>PANIC CLOSE ALL</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Fast Execution Ticket & Live Positions List */}
        <div className="terminalOrderColumn">
          {/* Order Ticket */}
          <OrderTicket
            account={account}
            accounts={accounts}
            positions={positions}
            onExecuteTrade={handleExecuteTrade}
            disabled={!account || !isOnline}
          />

          {/* Live Open Positions Matrix */}
          <div className="positionsSectionCard glass">
            <div className="cardHeader">
              <div className="cardHeaderTitle">
                <Activity size={18} className="textEmerald" />
                <h3>Live Open Positions ({positions.length})</h3>
              </div>
              <div className="headerNetPl">
                <span>Net P/L: </span>
                <strong className={`mono ${clsPL(openPl)}`}>{money(openPl)}</strong>
              </div>
            </div>

            <PositionsList
              positions={positions}
              onClosePosition={position => {
                if (account) {
                  onSendAction(
                    'CLOSE_MARKET',
                    { ticket: position.ticket, symbol: position.symbol, side: position.type },
                    copyClusterIds()
                  )
                }
              }}
              onClosePartial={(position, volume) => {
                if (account) {
                  onSendAction(
                    'PARTIAL_CLOSE',
                    { ticket: position.ticket, volume, symbol: position.symbol, side: position.type },
                    copyClusterIds()
                  )
                }
              }}
              onBreakEven={position => {
                if (account) {
                  onSendAction(
                    'FIRST_BREAK_EVEN',
                    { ticket: position.ticket, symbol: position.symbol, side: position.type },
                    copyClusterIds()
                  )
                }
              }}
              onModifySlTp={(position, sl, tp) => {
                if (account) {
                  onSendAction(
                    'MODIFY_SL_TP',
                    { ticket: position.ticket, sl, tp, symbol: position.symbol, side: position.type },
                    copyClusterIds()
                  )
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

import React, { useState } from 'react'
import {
  Zap,
  Activity,
  Trash2,
  KeyRound,
  Shield,
  Layers,
  ChevronDown,
  ChevronUp,
  Settings2,
  RefreshCw,
  Play,
  Pause,
  SlidersHorizontal,
  TrendingUp,
  TrendingDown,
  Share2
} from 'lucide-react'
import type { TradingAccount, CommandRow, CopyStatus } from '../../lib/types'
import { money, isAccountOnline, clsPL } from '../../lib/formatters'
import { StatusBadge } from '../common/StatusBadge'
import { AccountInlineController } from './AccountInlineController'
import { CopySwitch } from './CopySwitch'

export interface SlaveAccountCardProps {
  slave: TradingAccount
  masterAccounts: TradingAccount[]
  eaState?: any
  recentCommands: CommandRow[]
  isSelected: boolean
  onToggleSelect: () => void
  onToggleCopyStatus?: (slaveId: string, newStatus: CopyStatus) => void
  onReassignMaster: (slaveId: string, masterId: string | null) => void
  onSendAction: (action: string, payload?: any) => void
  onDelete: () => void
  onOpenSingle: () => void
  onOpenCredentials: () => void
  onOpenRiskModal?: (acc: TradingAccount) => void
  onOpenShareModal?: (acc: TradingAccount) => void
}

export const SlaveAccountCard: React.FC<SlaveAccountCardProps> = ({
  slave,
  masterAccounts,
  eaState,
  recentCommands,
  isSelected,
  onToggleSelect,
  onToggleCopyStatus,
  onReassignMaster,
  onSendAction,
  onDelete,
  onOpenSingle,
  onOpenCredentials,
  onOpenRiskModal,
  onOpenShareModal
}) => {
  const [expanded, setExpanded] = useState(false)
  const isOnline = isAccountOnline(slave, eaState)
  const balance = eaState?.balance ?? slave.balance ?? 0
  const equity = eaState?.equity ?? slave.equity ?? 0
  const openPl = eaState?.openPL ?? slave.open_pl ?? (equity - balance)
  const positions = eaState?.positions ?? []
  const isCopyActive = (slave.copy_status || 'ACTIVE') === 'ACTIVE'

  const slaveCommands = recentCommands.filter(c => c.account_id === slave.id).slice(0, 3)

  return (
    <div className={`slaveCard glass ${isSelected ? 'selected' : ''} ${!isCopyActive ? 'slavePaused' : ''}`}>
      <div className="slaveCardMainRow">
        {/* Left Checkbox & Identity */}
        <div className="slaveIdentitySection">
          <div className="slaveRoleBadge">
            <span>⚡ SLAVE</span>
          </div>

          <div className="slaveInfoText">
            <div className="slaveTitleRow">
              <h4 className="slaveName">{slave.label}</h4>
              <StatusBadge online={isOnline} />
              {onToggleCopyStatus && (
                <CopySwitch
                  status={slave.copy_status}
                  onToggle={next => onToggleCopyStatus(slave.id, next)}
                />
              )}
            </div>
            <div className="slaveSubMeta">
              <span>{slave.broker || 'MT5'}</span>
              <span>•</span>
              <span>{slave.server || 'Live'}</span>
              {slave.account_number && (
                <>
                  <span>•</span>
                  <span className="mono">#{slave.account_number}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Middle Master Link & Quick Metrics */}
        <div className="slaveCenterMetrics">
          <div className="assignedMasterDropdown">
            <span className="masterLabelSmall">Copying From:</span>
            <select
              value={slave.master_account_id || ''}
              onChange={e => onReassignMaster(slave.id, e.target.value || null)}
              className="styledSelect miniSelect"
            >
              <option value="">(No Master / Standalone)</option>
              {masterAccounts.map(m => (
                <option key={m.id} value={m.id}>
                  👑 {m.label} ({m.server || 'MT5'})
                </option>
              ))}
            </select>
          </div>

          <div className="slaveFinances">
            <div className="financeItem">
              <span className="finLabel">Balance</span>
              <strong className="mono">{money(balance)}</strong>
            </div>
            <div className="financeItem">
              <span className="finLabel">Floating P/L</span>
              <strong className={`mono ${clsPL(openPl)}`}>{money(openPl)}</strong>
            </div>
          </div>
        </div>

        {/* Right Actions & Expand Button */}
        <div className="slaveCardActions">
          <button
            type="button"
            className="ghostBtn miniBtn"
            onClick={() => onSendAction('FIRST_BREAK_EVEN', { symbol: slave.symbol || 'XAUUSD' })}
            title="Move Slave positions to BE"
          >
            BE
          </button>
          <button
            type="button"
            className="ghostBtn miniBtn"
            onClick={() => onSendAction('CLOSE_50', { symbol: slave.symbol || 'XAUUSD' })}
            title="Close 50% partial on Slave"
          >
            50%
          </button>
          <button
            type="button"
            className="ghostBtn miniBtn dangerMiniBtn"
            onClick={() => {
              if (window.confirm(`Close ALL open positions on ${slave.label}?`)) {
                onSendAction('CLOSE_ALL', { symbol: slave.symbol || 'XAUUSD' })
              }
            }}
            title="Close all positions on this slave"
          >
            Close All
          </button>
          <button
            type="button"
            className="ghostBtn miniBtn"
            onClick={onOpenSingle}
            title="Open Dedicated Terminal Dashboard"
          >
            <Activity size={14} />
          </button>
          <button
            type="button"
            className="ghostBtn miniBtn"
            onClick={() => setExpanded(!expanded)}
            title="View Details"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded Details Panel with Full Inline Risk & Mode Controller */}
      {expanded && (
        <div className="slaveExpandedPanel glass animateFadeIn">
          <div className="accountCredentialsQuickRow">
            <div className="quickCredentialInfo">
              <span>Account ID: <code className="mono textAccent">{slave.id}</code></span>
              <span>•</span>
              <span>Copy Status: <strong className={isCopyActive ? 'textEmerald' : 'textAmber'}>{isCopyActive ? 'ACTIVE' : 'PAUSED'}</strong></span>
              <span>•</span>
              <span>Free Margin: <strong className="mono">{money(eaState?.freeMargin ?? equity)}</strong></span>
            </div>

            <div className="quickCredentialButtons">
              <button
                type="button"
                className="ghostBtn miniBtn"
                onClick={onOpenCredentials}
              >
                <KeyRound size={13} /> 1-Click Key
              </button>
              <button
                type="button"
                className="ghostBtn miniBtn"
                onClick={() => onOpenShareModal && onOpenShareModal(slave)}
              >
                <Share2 size={13} /> Share Link
              </button>
              <button
                type="button"
                className="ghostBtn miniBtn dangerMiniBtn"
                onClick={onDelete}
              >
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>

          <AccountInlineController
            account={slave}
            eaState={eaState}
            recentCommands={recentCommands}
            onSendAction={onSendAction}
            onOpenCredentials={onOpenCredentials}
            onOpenShareModal={() => onOpenShareModal && onOpenShareModal(slave)}
          />
        </div>
      )}
    </div>
  )
}

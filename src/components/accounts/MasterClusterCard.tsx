import React, { useState } from 'react'
import {
  Crown,
  Activity,
  Plus,
  Layers,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Trash2,
  Flame,
  Play,
  Pause,
  Share2,
  Settings2,
  GitFork
} from 'lucide-react'
import type { TradingAccount, CommandRow, CopyStatus } from '../../lib/types'
import { money, isAccountOnline, clsPL } from '../../lib/formatters'
import { StatusBadge } from '../common/StatusBadge'
import { SlaveAccountCard } from './SlaveAccountCard'
import { AccountInlineController } from './AccountInlineController'
import { CopySwitch } from './CopySwitch'
import { isCopyOn } from '../../lib/copy-cluster'

export interface MasterClusterCardProps {
  master: TradingAccount
  allAccounts: TradingAccount[]
  eaStates: Record<string, any>
  recentCommands: CommandRow[]
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onToggleCopyStatus?: (accountId: string, newStatus: CopyStatus) => void
  onToggleAllSlavesCopyStatus?: (masterId: string, newStatus: CopyStatus) => void
  onReassignMaster: (slaveId: string, masterId: string | null) => void
  onSendBulk: (targetIds: string[], action: string, payload?: any) => void
  onDeleteAccount: (id: string, name: string) => void
  onNewSlave: (masterId: string) => void
  onOpenSingle: (id: string) => void
  onOpenCredentials: (acc: TradingAccount) => void
  onOpenRiskModal?: (acc: TradingAccount) => void
  onOpenShareModal?: (acc: TradingAccount) => void
}

export const MasterClusterCard: React.FC<MasterClusterCardProps> = ({
  master,
  allAccounts,
  eaStates,
  recentCommands,
  selectedIds,
  onToggleSelect,
  onToggleCopyStatus,
  onToggleAllSlavesCopyStatus,
  onReassignMaster,
  onSendBulk,
  onDeleteAccount,
  onNewSlave,
  onOpenSingle,
  onOpenCredentials,
  onOpenRiskModal,
  onOpenShareModal
}) => {
  const [showMasterControls, setShowMasterControls] = useState(false)
  const masterState = eaStates[master.id]
  const isOnline = isAccountOnline(master, masterState)
  const balance = masterState?.balance ?? master.balance ?? 0
  const equity = masterState?.equity ?? master.equity ?? 0
  const openPl = masterState?.openPL ?? master.open_pl ?? (equity - balance)
  const symbol = masterState?.symbol ?? master.symbol ?? 'XAUUSD'
  const isCopyActive = isCopyOn(master.copy_status)

  const slaves = allAccounts.filter(
    a => a.mode === 'SLAVE' && a.master_account_id === master.id
  )
  const linkedMasters = allAccounts.filter(
    a => a.mode === 'MASTER' && a.master_account_id === master.id
  )
  const followableMasters = allAccounts.filter(
    a => a.mode === 'MASTER' && a.id !== master.id
  )
  const activeSlavesCount = slaves.filter(s => s.copy_status === 'ACTIVE').length
  const allClusterIds = [master.id, ...slaves.map(s => s.id)]
  const masterAccounts = allAccounts.filter(a => a.mode === 'MASTER')

  const handleClusterAction = (action: string, payload: any = {}) => {
    onSendBulk(allClusterIds, action, { ...payload, symbol })
  }

  const toggleController = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setShowMasterControls(open => !open)
  }

  return (
    <div className="masterClusterStack">
      <div className={`masterClusterCard glass ${!isCopyActive ? 'clusterPaused' : ''}`}>
        <div className="clusterHeaderBar">
          <div className="clusterHeaderLeft">
            <div className="crownIconBox">
              <Crown size={22} className="crownGold" />
            </div>
            <div className="masterTitleBlock">
              <div className="masterTitleLine">
                <span className="masterBadgeTag">MASTER CLUSTER</span>
                <h3 className="masterNameText">{master.label}</h3>
                <StatusBadge online={isOnline} />
                {onToggleCopyStatus && (
                  <CopySwitch
                    size="md"
                    status={master.copy_status}
                    onToggle={next => onToggleCopyStatus(master.id, next)}
                    labelOn="COPY ON"
                    labelOff="COPY OFF"
                  />
                )}
              </div>
              <div className="masterMetaLine">
                <span>{master.broker || 'MT5 Broker'}</span>
                <span>•</span>
                <span>{master.server || 'Server'}</span>
                {master.account_number && (
                  <>
                    <span>•</span>
                    <span className="mono">#{master.account_number}</span>
                  </>
                )}
                <span>•</span>
                <span className="slaveCountBadge">
                  {activeSlavesCount}/{slaves.length} slaves ON
                  {linkedMasters.length > 0 ? ` • ${linkedMasters.length} linked master${linkedMasters.length === 1 ? '' : 's'}` : ''}
                </span>
              </div>
            </div>
          </div>

          <div className="clusterHeaderRight">
            <div className="masterKpiItem">
              <span className="kpiLabel">Balance</span>
              <strong className="mono">{money(balance)}</strong>
            </div>
            <div className="masterKpiItem">
              <span className="kpiLabel">Floating P/L</span>
              <strong className={`mono ${clsPL(openPl)}`}>{money(openPl)}</strong>
            </div>
            <div className="masterHeaderButtons">
              <button type="button" className="ghostBtn headerIconBtn" onClick={() => onOpenSingle(master.id)} title="Open Master Terminal View">
                <Activity size={15} />
              </button>
              <button type="button" className="ghostBtn headerIconBtn" onClick={() => onOpenShareModal && onOpenShareModal(master)} title="Share Master Account Dashboard">
                <Share2 size={15} />
              </button>
              <button type="button" className="ghostBtn headerIconBtn" onClick={() => onOpenCredentials(master)} title="View 1-Click Connection Key">
                <KeyRound size={15} />
              </button>
              <button type="button" className="ghostBtn headerIconBtn dangerGhost" onClick={() => onDeleteAccount(master.id, master.label)} title="Delete Master Account">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        </div>

        <div className="clusterQuickActionsStrip">
          <div className="stripLeftLabel">
            <Flame size={14} className="textAmber" />
            <span>Cluster Actions (Master + {slaves.length} Slaves):</span>
          </div>
          <div className="stripActionButtons">
            {slaves.length > 0 && onToggleAllSlavesCopyStatus && (
              activeSlavesCount < slaves.length ? (
                <button type="button" className="clusterActionPill enableAllSlavesPill" onClick={() => onToggleAllSlavesCopyStatus(master.id, 'ACTIVE')}>
                  <Play size={11} /> Resume All Slaves
                </button>
              ) : (
                <button type="button" className="clusterActionPill pauseAllSlavesPill" onClick={() => onToggleAllSlavesCopyStatus(master.id, 'PAUSED')}>
                  <Pause size={11} /> Pause All Slaves
                </button>
              )
            )}
            <button type="button" className="clusterActionPill bePill" onClick={() => handleClusterAction('FIRST_BREAK_EVEN')}>Move All to BE</button>
            <button type="button" className="clusterActionPill partialPill" onClick={() => handleClusterAction('CLOSE_50')}>Close 50% All</button>
            <button type="button" className="clusterActionPill armBuyPill" onClick={() => handleClusterAction('BUY')}>BUY</button>
            <button type="button" className="clusterActionPill armSellPill" onClick={() => handleClusterAction('SELL')}>SELL</button>
            <button
              type="button"
              className="clusterActionPill dangerPill"
              onClick={() => {
                if (window.confirm(`EMERGENCY: Close ALL positions across Master "${master.label}" and all ${slaves.length} connected slaves?`)) {
                  handleClusterAction('CLOSE_ALL')
                }
              }}
            >
              Panic Close All
            </button>
          </div>
        </div>

        <div className="clusterLinkRow">
          <GitFork size={14} />
          <span>Connect this master under another cluster:</span>
          <select
            value={master.master_account_id || ''}
            onChange={e => onReassignMaster(master.id, e.target.value || null)}
            className="styledSelect miniSelect"
          >
            <option value="">Standalone (top-level master)</option>
            {followableMasters.map(other => (
              <option key={other.id} value={other.id}>
                👑 {other.label}
              </option>
            ))}
          </select>
        </div>

        <div className="slavesContainer">
          <div className="slavesContainerHeader">
            <div className="slavesHeaderTitle">
              <Layers size={16} className="textPurple" />
              <h4>Connected Slaves Copiers ({slaves.length})</h4>
            </div>
            <button type="button" className="primaryBtn miniBtn" onClick={() => onNewSlave(master.id)}>
              <Plus size={13} />
              <span>Link New Slave</span>
            </button>
          </div>

          {slaves.length === 0 ? (
            <div className="noSlavesState glass">
              <p>No slave accounts linked to this master yet.</p>
              <button type="button" className="ghostBtn miniBtn" onClick={() => onNewSlave(master.id)}>
                <Plus size={13} /> Add first slave copier
              </button>
            </div>
          ) : (
            <div className="slavesListGrid">
              {slaves.map(slave => (
                <SlaveAccountCard
                  key={slave.id}
                  slave={slave}
                  masterAccounts={masterAccounts}
                  eaState={eaStates[slave.id]}
                  recentCommands={recentCommands}
                  isSelected={selectedIds.includes(slave.id)}
                  onToggleSelect={() => onToggleSelect(slave.id)}
                  onToggleCopyStatus={onToggleCopyStatus}
                  onReassignMaster={onReassignMaster}
                  onSendAction={(action, payload) => onSendBulk([slave.id], action, payload)}
                  onDelete={() => onDeleteAccount(slave.id, slave.label)}
                  onOpenSingle={() => onOpenSingle(slave.id)}
                  onOpenCredentials={() => onOpenCredentials(slave)}
                  onOpenRiskModal={onOpenRiskModal}
                  onOpenShareModal={onOpenShareModal}
                />
              ))}
            </div>
          )}

          {linkedMasters.length > 0 && (
            <div className="linkedMastersSection">
              <div className="slavesHeaderTitle" style={{ margin: '18px 0 10px' }}>
                <Crown size={16} className="crownGold" />
                <h4>Linked master clusters ({linkedMasters.length})</h4>
              </div>
              {linkedMasters.map(nested => (
                <MasterClusterCard
                  key={nested.id}
                  master={nested}
                  allAccounts={allAccounts}
                  eaStates={eaStates}
                  recentCommands={recentCommands}
                  selectedIds={selectedIds}
                  onToggleSelect={onToggleSelect}
                  onToggleCopyStatus={onToggleCopyStatus}
                  onToggleAllSlavesCopyStatus={onToggleAllSlavesCopyStatus}
                  onReassignMaster={onReassignMaster}
                  onSendBulk={onSendBulk}
                  onDeleteAccount={onDeleteAccount}
                  onNewSlave={onNewSlave}
                  onOpenSingle={onOpenSingle}
                  onOpenCredentials={onOpenCredentials}
                  onOpenRiskModal={onOpenRiskModal}
                  onOpenShareModal={onOpenShareModal}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="masterControllerCard glass">
        <div className="masterControllerHeader">
          <div className="masterControllerTitle">
            <Settings2 size={16} className="textCyan" />
            <div>
              <h4>{master.label} risk & controller</h4>
              <div className="masterControllerMeta">
                Same as slave: minimize hides only this controller. Equity {money(equity)}.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="ghostBtn headerIconBtn collapseClusterBtn"
            onClick={toggleController}
            title={showMasterControls ? 'Minimize controller' : 'Expand controller'}
            aria-expanded={showMasterControls}
          >
            {showMasterControls ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {showMasterControls ? (
          <div className="slaveExpandedPanel" style={{ marginTop: 12 }}>
            <AccountInlineController
              account={master}
              eaState={masterState}
              recentCommands={recentCommands}
              onSendAction={(action, payload) => onSendBulk([master.id], action, payload)}
              onOpenCredentials={() => onOpenCredentials(master)}
              onOpenShareModal={() => onOpenShareModal && onOpenShareModal(master)}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

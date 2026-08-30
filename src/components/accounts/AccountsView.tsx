import React, { useState, useMemo } from 'react'
import {
  Layers,
  Crown,
  GitFork,
  Plus,
  RefreshCw,
  AlertCircle
} from 'lucide-react'
import type { TradingAccount, CommandRow, CopyStatus } from '../../lib/types'
import { MasterClusterCard } from './MasterClusterCard'
import { SlaveAccountCard } from './SlaveAccountCard'
import { TopologyGraph } from './TopologyGraph'
import { supabase } from '../../lib/supabase'
import { isRootMasterCluster, wouldCreateMasterCycle } from '../../lib/copy-cluster'

export interface AccountsViewProps {
  accounts: TradingAccount[]
  eaStates: Record<string, any>
  selectedIds?: string[]
  onToggleSelect?: (id: string) => void
  onSelectAllVisible?: (ids: string[]) => void
  onToggleCopyStatus: (accountId: string, newStatus: CopyStatus) => Promise<void>
  onToggleAllSlavesCopyStatus?: (masterId: string, newStatus: CopyStatus) => Promise<void>
  onSendBulk: (targetIds: string[], action: string, payload?: any) => void
  onNewMaster: () => void
  onNewSlave: (masterId?: string) => void
  onDeleteAccount: (id: string, name: string) => void
  onOpenSingle: (id: string) => void
  onOpenCredentials: (acc: TradingAccount) => void
  onOpenRiskModal?: (acc: TradingAccount) => void
  onOpenShareModal?: (acc: TradingAccount) => void
  recentCommands: CommandRow[]
  lastSyncAt: Date
  onRefresh: () => void
  toast: (msg: string) => void
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  accounts,
  eaStates,
  selectedIds = [],
  onToggleSelect = () => {},
  onToggleCopyStatus,
  onToggleAllSlavesCopyStatus,
  onSendBulk,
  onNewMaster,
  onNewSlave,
  onDeleteAccount,
  onOpenSingle,
  onOpenCredentials,
  onOpenRiskModal,
  onOpenShareModal,
  recentCommands,
  onRefresh,
  toast
}) => {
  const masterAccounts = useMemo(() => accounts.filter(a => a.mode === 'MASTER'), [accounts])
  const [activeTab, setActiveTab] = useState<string>('all')

  // Slaves without an assigned master
  const orphanSlaves = useMemo(() => {
    return accounts.filter(
      a => a.mode === 'SLAVE' && (!a.master_account_id || !masterAccounts.some(m => m.id === a.master_account_id))
    )
  }, [accounts, masterAccounts])

  const handleReassignMaster = async (accountId: string, masterId: string | null) => {
    if (masterId && wouldCreateMasterCycle(accounts, accountId, masterId)) {
      toast('Cannot connect: that would create a copy loop.')
      return
    }
    try {
      const { error } = await supabase
        .from('trading_accounts')
        .update({ master_account_id: masterId })
        .eq('id', accountId)

      if (error) throw error
      toast('Cluster connection updated.')
      onRefresh()
    } catch (err: any) {
      toast(`Update failed: ${err.message}`)
    }
  }

  const rootMasters = useMemo(
    () => masterAccounts.filter(master => isRootMasterCluster(accounts, master)),
    [accounts, masterAccounts]
  )

  return (
    <div className="accountsPageWrapper">
      {/* Top Header & Fast Action Toolbar */}
      <div className="accountsHeader glass">
        <div className="accountsHeaderTitle">
          <div className="titleBadge">Multi-Master Architecture</div>
          <h2>Account Cockpits & Copier Clusters</h2>
          <p>Instant trade replication: Any trade or SL/TP placed on a Master automatically copies to all connected Slaves.</p>
        </div>

        <div className="accountsHeaderActions">
          <button
            type="button"
            className="ghostBtn secondaryBtn"
            onClick={onRefresh}
          >
            <RefreshCw size={15} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            className="ghostBtn secondaryBtn"
            onClick={() => onNewSlave()}
          >
            <Plus size={15} />
            <span>New Slave EA</span>
          </button>

          <button
            type="button"
            className="primaryBtn"
            onClick={onNewMaster}
          >
            <Plus size={15} />
            <span>New Master EA</span>
          </button>
        </div>
      </div>

      {/* Cluster Navigation & View Switcher Tabs */}
      <div className="clusterTabsRow">
        <div className="tabsScrollContainer">
          <button
            type="button"
            className={`clusterTabBtn ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            <Layers size={16} />
            <span>All Master Clusters ({masterAccounts.length})</span>
          </button>

          <button
            type="button"
            className={`clusterTabBtn ${activeTab === 'topology' ? 'active' : ''}`}
            onClick={() => setActiveTab('topology')}
          >
            <GitFork size={16} />
            <span>Topology Graph</span>
          </button>

          {masterAccounts.map(m => {
            const slaveCount = accounts.filter(s => s.master_account_id === m.id && s.mode === 'SLAVE').length
            return (
              <button
                key={m.id}
                type="button"
                className={`clusterTabBtn ${activeTab === m.id ? 'active' : ''}`}
                onClick={() => setActiveTab(m.id)}
              >
                <Crown size={15} className="crownGold" />
                <span>{m.label} ({slaveCount} Slaves)</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Content Area: Topology Graph or Master Clusters List */}
      {activeTab === 'topology' ? (
        <TopologyGraph
          accounts={accounts}
          eaStates={eaStates}
          onSelectAccount={onOpenSingle}
        />
      ) : (
        <div className="clustersListWrapper">
          {masterAccounts.length === 0 ? (
            <div className="noAccountsWelcome glass">
              <div className="welcomeBadge">
                <Crown size={32} className="crownGold" />
              </div>
              <h3>Welcome to TCX Copy Pro</h3>
              <p>You have not connected any Master MT5 terminals yet. Create your first Master EA to start copying.</p>
              <button
                type="button"
                className="primaryBtn welcomeActionBtn"
                onClick={onNewMaster}
              >
                <Plus size={16} />
                <span>Connect First Master EA</span>
              </button>
            </div>
          ) : (
            (activeTab === 'all'
              ? rootMasters
              : masterAccounts.filter(m => m.id === activeTab)
            ).map(master => (
              <MasterClusterCard
                key={master.id}
                master={master}
                allAccounts={accounts}
                eaStates={eaStates}
                recentCommands={recentCommands}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                onToggleCopyStatus={onToggleCopyStatus}
                onToggleAllSlavesCopyStatus={onToggleAllSlavesCopyStatus}
                onReassignMaster={handleReassignMaster}
                onSendBulk={onSendBulk}
                onDeleteAccount={onDeleteAccount}
                onNewSlave={onNewSlave}
                onOpenSingle={onOpenSingle}
                onOpenCredentials={onOpenCredentials}
                onOpenRiskModal={onOpenRiskModal}
                onOpenShareModal={onOpenShareModal}
              />
            ))
          )}

          {/* Orphan Slaves Section */}
          {orphanSlaves.length > 0 && (
            <div className="orphanSlavesCard glass animateFadeIn">
              <div className="orphanHeader">
                <div className="orphanTitle">
                  <AlertCircle size={18} className="textAmber" />
                  <h4>Unassigned Slave Terminals ({orphanSlaves.length})</h4>
                </div>
                <small className="textMuted">These slave copiers are not linked to any Master terminal.</small>
              </div>

              <div className="slavesListGrid">
                {orphanSlaves.map(slave => (
                  <SlaveAccountCard
                    key={slave.id}
                    slave={slave}
                    masterAccounts={masterAccounts}
                    eaState={eaStates[slave.id]}
                    recentCommands={recentCommands}
                    isSelected={false}
                    onToggleSelect={() => {}}
                    onToggleCopyStatus={onToggleCopyStatus}
                    onReassignMaster={handleReassignMaster}
                    onSendAction={(action, payload) => onSendBulk([slave.id], action, payload)}
                    onDelete={() => onDeleteAccount(slave.id, slave.label)}
                    onOpenSingle={() => onOpenSingle(slave.id)}
                    onOpenCredentials={() => onOpenCredentials(slave)}
                    onOpenRiskModal={onOpenRiskModal}
                    onOpenShareModal={onOpenShareModal}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import React, { useState } from 'react'
import {
  Zap,
  Activity,
  History,
  Settings2,
  Plus,
  RefreshCw,
  LogOut,
  ChevronDown,
  User,
  Shield,
  Layers,
  MonitorDot
} from 'lucide-react'
import type { TradingAccount } from '../../lib/types'
import { formatClock, isAccountOnline } from '../../lib/formatters'
import { supabase } from '../../lib/supabase'

export type ViewType = 'dashboard' | 'accounts' | 'history' | 'rules' | 'settings'

export interface HeaderProps {
  user: any
  accounts: TradingAccount[]
  eaStates: Record<string, any>
  selectedId: string
  setSelectedId: (id: string) => void
  currentView: ViewType
  setView: (v: ViewType) => void
  onRefresh: () => void
  isRefreshing: boolean
  lastSyncAt: Date
  onNewMaster: () => void
  onNewSlave: () => void
}

export const Header: React.FC<HeaderProps> = ({
  user,
  accounts,
  eaStates,
  selectedId,
  setSelectedId,
  currentView,
  setView,
  onRefresh,
  isRefreshing,
  lastSyncAt,
  onNewMaster,
  onNewSlave
}) => {
  const [profileOpen, setProfileOpen] = useState(false)
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false)

  const selectedAccount = accounts.find(a => a.id === selectedId) || accounts[0]
  const isOnline = isAccountOnline(selectedAccount, selectedAccount ? eaStates[selectedAccount.id] : null)
  const onlineAccounts = accounts.filter(account => isAccountOnline(account, eaStates[account.id])).length
  const offlineAccounts = Math.max(0, accounts.length - onlineAccounts)

  const navItems: { id: ViewType; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Activity size={17} /> },
    { id: 'accounts', label: 'Clusters & Accounts', icon: <Layers size={17} /> },
    { id: 'history', label: 'Trade Audit', icon: <History size={17} /> },
    { id: 'rules', label: 'Risk & Rules', icon: <Shield size={17} /> },
    { id: 'settings', label: 'Settings', icon: <Settings2 size={17} /> }
  ]

  const userMeta = user?.user_metadata || {}
  const activeViewLabel = navItems.find(item => item.id === currentView)?.label || 'Dashboard'
  const displayName = userMeta.full_name || (userMeta.first_name
    ? `${userMeta.first_name || ''} ${userMeta.last_name || ''}`.trim()
    : user?.email?.split('@')[0] || 'Trader')

  return (
    <header className="appHeader">
      <aside className="appSidebar" aria-label="Primary navigation">
        <div className="sidebarBrandBlock">
          <button type="button" className="appLogoMark" onClick={() => setView('dashboard')} aria-label="Open dashboard">
            <span className="appLogoIcon">
              <Zap size={20} className="logoZap" />
            </span>
            <span className="appLogoText">
              <span className="appLogoTitle">TCX ENGINE</span>
              <span className="appLogoBadge">PRO CLOUD</span>
            </span>
          </button>
          <span className="sidebarEyebrow">Operations console</span>
        </div>

        <div className="sidebarNavLabel">Workspace</div>
        <nav className="desktopNavLinks" aria-label="Workspace views">
          {navItems.map(item => (
            <button
              key={item.id}
              type="button"
              className={`navLinkBtn ${currentView === item.id ? 'active' : ''}`}
              onClick={() => setView(item.id)}
              aria-current={currentView === item.id ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <section className="sidebarOperations" aria-label="Operations summary">
          <div className="sidebarSectionHeader">
            <span>Operations</span>
            <span className="sidebarLiveMark"><span className="pulseCircle" /> Live</span>
          </div>
          <div className="operationsStats">
            <div className="operationsStat">
              <strong>{accounts.length}</strong>
              <span>Terminals</span>
            </div>
            <div className="operationsStat onlineStat">
              <strong>{onlineAccounts}</strong>
              <span>Online</span>
            </div>
          </div>
            <div className="operationsStatusLine">
              <MonitorDot size={14} />
              <span>{accounts.length === 0
                ? 'Ready for your first terminal'
                : offlineAccounts === 0
                  ? 'All terminals reporting'
                  : `${offlineAccounts} terminal${offlineAccounts === 1 ? '' : 's'} offline`}</span>
            </div>
        </section>

        <button type="button" className="sidebarConnectButton" onClick={onNewMaster}>
          <span className="sidebarConnectIcon"><Plus size={16} /></span>
          <span className="sidebarConnectCopy">
            <strong>Connect terminal</strong>
            <small>Master or slave</small>
          </span>
        </button>

        <div className="sidebarFooterNote">
          <span className={`statusIndicatorDot ${accounts.length > 0 ? 'online' : 'offline'}`} />
          <span>{accounts.length > 0 ? 'Syncing terminal health' : 'Waiting for terminal'}</span>
        </div>
      </aside>

      <div className="headerMain">
        <div className="headerContainer">
          <div className="headerContext">
            <span className="headerContextKicker">TCX ENGINE <span>/</span> {activeViewLabel}</span>
            <strong className="headerContextTitle">{currentView === 'dashboard' ? 'Control room' : activeViewLabel}</strong>
          </div>

          {accounts.length > 0 && (
            <div className="accountQuickSelectWrapper">
              <button
                type="button"
                className="selectedAccountChip"
                onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
                aria-expanded={accountDropdownOpen}
                aria-haspopup="listbox"
              >
                <span className={`statusIndicatorDot ${isOnline ? 'online' : 'offline'}`} />
                <span className="accountRoleTag">
                  {selectedAccount?.mode === 'MASTER' ? '👑 Master' : '⚡ Slave'}
                </span>
                <span className="accountChipName">{selectedAccount?.label || 'Select Account'}</span>
                <ChevronDown size={14} className={`dropdownArrow ${accountDropdownOpen ? 'open' : ''}`} />
              </button>

              {accountDropdownOpen && (
                <div className="accountDropdownMenu glass animateFadeIn" role="listbox" aria-label="Connected terminals">
                  <div className="dropdownHeader">
                    <span>Connected Terminals ({accounts.length})</span>
                  </div>
                  <div className="dropdownList">
                    {accounts.map(acc => {
                      const accOnline = isAccountOnline(acc, eaStates[acc.id])
                      const isCurr = acc.id === selectedAccount?.id
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          className={`dropdownItem ${isCurr ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedId(acc.id)
                            setAccountDropdownOpen(false)
                          }}
                          role="option"
                          aria-selected={isCurr}
                        >
                          <span className={`statusIndicatorDot ${accOnline ? 'online' : 'offline'}`} />
                          <span className="itemInfo">
                            <span className="itemTitle">
                              <span className="modeIcon">{acc.mode === 'MASTER' ? '👑' : '⚡'}</span>
                              <strong>{acc.label}</strong>
                            </span>
                            <small className="itemMeta">
                              {acc.server || 'MT5'} {acc.account_number ? `• #${acc.account_number}` : ''}
                            </small>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="dropdownFooter">
                    <button
                      type="button"
                      className="quickAddBtn"
                      onClick={() => {
                        setAccountDropdownOpen(false)
                        onNewMaster()
                      }}
                    >
                      <Plus size={13} /> Add Master
                    </button>
                    <button
                      type="button"
                      className="quickAddBtn"
                      onClick={() => {
                        setAccountDropdownOpen(false)
                        onNewSlave()
                      }}
                    >
                      <Plus size={13} /> Add Slave
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="headerRightSection">
            <div className={`liveHeartbeatBadge ${accounts.length === 0 ? 'isReady' : ''}`} title={`Last synced: ${formatClock(lastSyncAt)}`}>
              <span className={`pulseCircle ${accounts.length === 0 ? 'mutedPulse' : ''}`} />
              <span className="liveLabel">{accounts.length > 0 ? 'LIVE' : 'READY'}</span>
              <span className="clockValue">{formatClock(lastSyncAt)}</span>
            </div>

            <button
              type="button"
              className="headerActionBtn iconOnlyBtn"
              onClick={onRefresh}
              title="Refresh terminal data"
              aria-label="Refresh terminal data"
            >
              <RefreshCw size={16} className={isRefreshing ? 'spin' : ''} />
            </button>

            <div className="userProfileWrapper">
              <button
                type="button"
                className="userProfilePill glass"
                onClick={() => setProfileOpen(!profileOpen)}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
              >
                <span className="userAvatar">
                  <User size={15} />
                </span>
                <span className="userNameText">{displayName}</span>
                <ChevronDown size={14} className={`dropdownArrow ${profileOpen ? 'open' : ''}`} />
              </button>

              {profileOpen && (
                <div className="profileDropdownMenu glass animateFadeIn" role="menu">
                  <div className="profileMenuHeader">
                    <strong>{displayName}</strong>
                    <span>{user?.email}</span>
                    {userMeta.phone_number && <small>{userMeta.phone_number}</small>}
                  </div>
                  <div className="profileMenuItems">
                    <button
                      type="button"
                      className="profileMenuItem"
                      onClick={() => {
                        setView('settings')
                        setProfileOpen(false)
                      }}
                      role="menuitem"
                    >
                      <Settings2 size={16} />
                      <span>Workspace Settings</span>
                    </button>
                    <button
                      type="button"
                      className="profileMenuItem dangerItem"
                      onClick={() => {
                        setProfileOpen(false)
                        supabase.auth.signOut()
                      }}
                      role="menuitem"
                    >
                      <LogOut size={16} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertTriangle } from 'lucide-react'
import { supabase } from './lib/supabase'
import type { TradingAccount, TradeEvent, CommandRow, CopyStatus } from './lib/types'
import { AuthScreen } from './components/auth/AuthScreen'
import { Header, type ViewType } from './components/layout/Header'
import { MobileNav } from './components/layout/MobileNav'
import { DashboardView } from './components/dashboard/DashboardView'
import { AccountsView } from './components/accounts/AccountsView'
import { HistoryView } from './components/history/HistoryView'
import { RulesView } from './components/rules/RulesView'
import { SettingsView } from './components/settings/SettingsView'
import { CreateAccountModal } from './components/modals/CreateAccountModal'
import { CredentialsModal } from './components/modals/CredentialsModal'
import { AccountRiskModal } from './components/modals/AccountRiskModal'
import { ShareSettingsModal } from './components/share/ShareSettingsModal'
import { PublicShareView } from './components/share/PublicShareView'
import { Toast } from './components/common/Toast'
import './styles.css'

function App() {
  // Check for Public Share Link in URL
  const shareToken = useMemo(() => {
    return new URLSearchParams(window.location.search).get('share')
  }, [])

  if (shareToken) {
    return <PublicShareView shareToken={shareToken} />
  }

  const [session, setSession] = useState<any>(null)
  const [view, setView] = useState<ViewType>('dashboard')
  const [accounts, setAccounts] = useState<TradingAccount[]>([])
  const [eaStates, setEaStates] = useState<Record<string, any>>({})
  const [events, setEvents] = useState<TradeEvent[]>([])
  const [recentCommands, setRecentCommands] = useState<CommandRow[]>([])
  const [selectedId, setSelectedId] = useState<string>(() => {
    return localStorage.getItem('tcx_selected_account_id') || ''
  })
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [emergencyStop, setEmergencyStop] = useState(false)
  const [modalConfig, setModalConfig] = useState<{ mode: 'master' | 'slave'; masterId?: string } | null>(null)
  const [createdCredentials, setCreatedCredentials] = useState<{
    id: string
    key: string
    label: string
    mode?: 'MASTER' | 'SLAVE'
  } | null>(null)
  const [riskModalAccount, setRiskModalAccount] = useState<TradingAccount | null>(null)
  const [shareModalAccount, setShareModalAccount] = useState<TradingAccount | null>(null)
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'error' | 'info' } | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<Date>(new Date())

  // Account selector that persists to localStorage
  const handleSelectAccount = useCallback((id: string) => {
    setSelectedId(id)
    if (id) {
      localStorage.setItem('tcx_selected_account_id', id)
    }
  }, [])

  // 1-second live ticker hook to ensure online/offline heartbeat status flips instantly on exact second
  const [, setLiveTick] = useState<number>(Date.now())
  useEffect(() => {
    const timer = setInterval(() => setLiveTick(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Show Toast helper
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type })
  }, [])

  // Auto-toast dismiss after 4 seconds
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // Auth session listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => {
      authListener?.subscription?.unsubscribe()
    }
  }, [])

  // Load all accounts, states, events, commands
  const loadData = useCallback(async () => {
    if (!session) return
    setLoading(true)
    try {
      const [accRes, stateRes, evtRes, cmdRes] = await Promise.all([
        supabase.from('trading_accounts').select('*').order('created_at', { ascending: true }),
        supabase.from('ea_states').select('*'),
        supabase.from('trade_events').select('*').order('created_at', { ascending: false }).limit(60),
        supabase.from('commands').select('*').order('created_at', { ascending: false }).limit(40)
      ])

      const firstError = accRes.error || stateRes.error || evtRes.error || cmdRes.error
      if (firstError) throw firstError

      if (accRes.data) {
        const accs = accRes.data as TradingAccount[]
        setAccounts(accs)
        const workspaceId = accs[0]?.workspace_id
        if (workspaceId) {
          const { data: workspace, error: workspaceError } = await supabase
            .from('workspaces')
            .select('emergency_stop')
            .eq('id', workspaceId)
            .maybeSingle()
          if (!workspaceError && workspace) setEmergencyStop(Boolean(workspace.emergency_stop))
        }
        const savedId = localStorage.getItem('tcx_selected_account_id')
        const matched = accs.find(a => a.id === savedId)
        if (matched) {
          setSelectedId(matched.id)
        } else if (accs.length > 0) {
          setSelectedId(accs[0].id)
          localStorage.setItem('tcx_selected_account_id', accs[0].id)
        }
      }

      if (stateRes.data) {
        const stateMap: Record<string, any> = {}
        stateRes.data.forEach((r: any) => {
          stateMap[r.account_id] = {
            ...(r.state || {}),
            updated_at: r.updated_at
          }
        })
        setEaStates(stateMap)
      }

      if (evtRes.data) {
        setEvents(evtRes.data as TradeEvent[])
      }

      if (cmdRes.data) {
        setRecentCommands(cmdRes.data as CommandRow[])
      }

      setLastSyncAt(new Date())
    } catch (err: any) {
      console.error('Error loading terminal data:', err)
    } finally {
      setLoading(false)
    }
  }, [session])

  // Realtime carries changes immediately; this slower refresh is a recovery path for
  // a dropped websocket and is not used as the liveness clock.
  useEffect(() => {
    if (session) {
      void loadData()
      const interval = setInterval(loadData, 5000)
      return () => clearInterval(interval)
    }
  }, [session, loadData])

  // Real-time Postgres subscriptions
  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel('public:copy_engine_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trading_accounts' }, () => void loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ea_states' }, () => void loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commands' }, () => void loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trade_events' }, () => void loadData())
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [session, loadData])

  // Send Command to one or multiple accounts
  const sendAction = async (targetIds: string[], action: string, payload: any = {}) => {
    if (targetIds.length === 0) {
      showToast('Please select at least one account.', 'info')
      return
    }
    try {
      const { data, error } = await supabase.rpc('create_bulk_command', {
        p_account_ids: targetIds,
        p_action: action,
        p_payload: payload
      })

      if (error) throw error
      if (data?.ok === false) throw new Error(data.error || 'Command was rejected by the workspace safety policy.')

      const count = data?.sent ?? targetIds.length
      showToast(
        count > 1
          ? `Sent live ${action} to master + ${count - 1} slave terminal(s).`
          : `Sent live ${action} to 1 MT5 terminal.`,
        'info'
      )
      void loadData()
    } catch (err: any) {
      showToast(`Command dispatch failed: ${err.message}`, 'error')
    }
  }

  const handleToggleCopyStatus = async (accountId: string, newStatus: CopyStatus) => {
    try {
      const target = accounts.find(a => a.id === accountId)
      const { error } = await supabase
        .from('trading_accounts')
        .update({ copy_status: newStatus })
        .eq('id', accountId)
      if (error) throw error

      showToast(
        `${target?.label || 'Account'} copy ${newStatus === 'ACTIVE' ? 'ON' : 'OFF'}. Other accounts are unchanged.`,
        'success'
      )
      void loadData()
    } catch (err: any) {
      showToast(`Failed to update copy status: ${err.message}`, 'error')
    }
  }

  // Toggle all slaves under a master
  const handleToggleAllSlavesCopyStatus = async (masterId: string, newStatus: CopyStatus) => {
    try {
      const { error } = await supabase
        .from('trading_accounts')
        .update({ copy_status: newStatus })
        .eq('master_account_id', masterId)
      if (error) throw error
      showToast(`All connected slaves set to ${newStatus}.`, 'success')
      void loadData()
    } catch (err: any) {
      showToast(`Failed to update slaves copy status: ${err.message}`, 'error')
    }
  }

  // Delete an account connection
  const handleDeleteAccount = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete account connection "${name}"?`)) return
    try {
      const { error } = await supabase.from('trading_accounts').delete().eq('id', id)
      if (error) throw error
      showToast(`Account "${name}" deleted.`, 'success')
      void loadData()
    } catch (err: any) {
      showToast(`Delete failed: ${err.message}`, 'error')
    }
  }

  // If not authenticated, render AuthScreen
  if (!session) {
    return <AuthScreen onAuthSuccess={loadData} />
  }

  const selectedAccount = accounts.find(a => a.id === selectedId) || accounts[0]

  const toggleEmergencyStop = async () => {
    const workspaceId = accounts[0]?.workspace_id
    if (!workspaceId) {
      showToast('No workspace is available for emergency control.', 'error')
      return
    }
    const next = !emergencyStop
    const { error } = await supabase
      .from('workspaces')
      .update({ emergency_stop: next })
      .eq('id', workspaceId)
    if (error) {
      showToast(`Emergency stop update failed: ${error.message}`, 'error')
      return
    }
    setEmergencyStop(next)
    showToast(next ? 'Emergency stop ENABLED.' : 'Emergency stop disabled.', next ? 'error' : 'success')
  }

  const rotateConnectionKey = async (credentials: { id: string; label: string; mode?: 'MASTER' | 'SLAVE' }) => {
    const rawKey = `EA-${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawKey))
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('')
    const { error } = await supabase
      .from('ea_devices')
      .update({ credential_hash: hashHex })
      .eq('account_id', credentials.id)
    if (error) {
      showToast(`Connection key rotation failed: ${error.message}`, 'error')
      return
    }
    setCreatedCredentials({ ...credentials, key: rawKey })
    showToast('New connection key generated. Update the MT5 EA now.', 'success')
  }

  return (
    <div className="terminalAppShell">
      {/* Top Application Header */}
      <Header
        user={session.user}
        accounts={accounts}
        eaStates={eaStates}
        selectedId={selectedId}
        setSelectedId={handleSelectAccount}
        currentView={view}
        setView={setView}
        onRefresh={loadData}
        isRefreshing={loading}
        lastSyncAt={lastSyncAt}
        onNewMaster={() => setModalConfig({ mode: 'master' })}
        onNewSlave={(masterId?: string) => setModalConfig({ mode: 'slave', masterId })}
      />

      {/* Main View Container */}
      <main className="mainContentArea">
        {/* Emergency Stop Banner */}
        {emergencyStop && (
          <div className="emergencyStopBanner glass animateSlideUp">
            <AlertTriangle size={18} className="textAmber" />
            <span>
              <strong>Emergency Mode Active:</strong> Trade copying and new market entries are halted across all accounts.
            </span>
          </div>
        )}

        {/* Dynamic Views */}
        {view === 'dashboard' && (
          <DashboardView
            account={selectedAccount}
            accounts={accounts}
            state={selectedAccount ? eaStates[selectedAccount.id] : null}
            onSelectAccount={handleSelectAccount}
            onSendAction={(action, payload, customIds) => {
              const ids = customIds || (selectedAccount ? [selectedAccount.id] : [])
              if (ids.length > 0) sendAction(ids, action, payload)
            }}
            onToggleCopyStatus={handleToggleCopyStatus}
            onToggleAllSlavesCopyStatus={handleToggleAllSlavesCopyStatus}
            onNewMaster={() => setModalConfig({ mode: 'master' })}
            onNewSlave={(masterId?: string) => setModalConfig({ mode: 'slave', masterId })}
            onOpenCredentials={acc => {
              setCreatedCredentials({
                id: acc.id,
                key: 'Stored in MT5',
                label: acc.label,
                mode: acc.mode
              })
            }}
            onOpenRiskModal={acc => setRiskModalAccount(acc)}
            onOpenShareModal={acc => setShareModalAccount(acc)}
          />
        )}

        {view === 'accounts' && (
          <AccountsView
            accounts={accounts}
            eaStates={eaStates}
            selectedIds={selectedAccountIds}
            onToggleSelect={id => {
              setSelectedAccountIds(prev =>
                prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
              )
            }}
            onSelectAllVisible={ids => setSelectedAccountIds(ids)}
            onToggleCopyStatus={handleToggleCopyStatus}
            onToggleAllSlavesCopyStatus={handleToggleAllSlavesCopyStatus}
            onSendBulk={sendAction}
            onNewMaster={() => setModalConfig({ mode: 'master' })}
            onNewSlave={(masterId?: string) => setModalConfig({ mode: 'slave', masterId })}
            onDeleteAccount={handleDeleteAccount}
            onOpenSingle={id => {
              setSelectedId(id)
              setView('dashboard')
            }}
            onOpenCredentials={acc => {
              setCreatedCredentials({
                id: acc.id,
                key: 'Stored in MT5',
                label: acc.label,
                mode: acc.mode
              })
            }}
            onOpenRiskModal={acc => setRiskModalAccount(acc)}
            onOpenShareModal={acc => setShareModalAccount(acc)}
            recentCommands={recentCommands}
            lastSyncAt={lastSyncAt}
            onRefresh={loadData}
            toast={msg => showToast(msg, 'success')}
          />
        )}

        {view === 'history' && (
          <HistoryView
            events={events}
            onRefresh={loadData}
          />
        )}

        {view === 'rules' && (
          <RulesView
            accounts={accounts}
            onSendCommand={(action, payload, targetIds) => {
              if (targetIds && targetIds.length > 0) {
                sendAction(targetIds, action, payload)
              }
            }}
            onRefresh={loadData}
            toast={showToast}
          />
        )}

        {view === 'settings' && (
          <SettingsView
            user={session.user}
            accounts={accounts}
            emergencyStop={emergencyStop}
            onToggleEmergencyStop={toggleEmergencyStop}
            toast={showToast}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNav currentView={view} setView={setView} />

      {/* Account Creation Modal */}
      {modalConfig && (
        <CreateAccountModal
          mode={modalConfig.mode}
          accounts={accounts}
          masterAccounts={accounts.filter(a => a.mode === 'MASTER')}
          preselectedMasterId={modalConfig.masterId}
          onClose={() => setModalConfig(null)}
          onSuccess={newAcc => {
            setModalConfig(null)
            setCreatedCredentials(newAcc)
            void loadData()
          }}
          toast={showToast}
        />
      )}

      {/* 1-Click Credentials Modal */}
      {createdCredentials && (
        <CredentialsModal
          credentials={createdCredentials}
          onClose={() => setCreatedCredentials(null)}
          onRotate={createdCredentials.key === 'Stored in MT5'
            ? () => rotateConnectionKey(createdCredentials)
            : undefined}
          toast={showToast}
        />
      )}

      {/* Per-Account Risk & Partials Modal */}
      {riskModalAccount && (
        <AccountRiskModal
          account={riskModalAccount}
          onClose={() => setRiskModalAccount(null)}
          onSendCommand={(action, payload, targetIds) => {
            sendAction(targetIds || [riskModalAccount.id], action, payload)
          }}
          toast={showToast}
          onUpdated={loadData}
        />
      )}

      {/* Public Share Account Modal */}
      {shareModalAccount && (
        <ShareSettingsModal
          account={shareModalAccount}
          onClose={() => setShareModalAccount(null)}
          toast={showToast}
          onUpdated={loadData}
        />
      )}

      {/* Floating Global Status Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<App />)
}

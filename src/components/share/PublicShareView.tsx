import React, { useState, useEffect, useCallback } from 'react'
import {
  Wallet,
  Activity,
  TrendingUp,
  Clock,
  ShieldCheck,
  Wifi,
  WifiOff,
  RefreshCw,
  Eye,
  Lock,
  Layers
} from 'lucide-react'
import type { TradingAccount, PositionItem, TradeEvent } from '../../lib/types'
import { money, moneyPlain, isAccountOnline, clsPL, formatClock, formatDate } from '../../lib/formatters'
import { supabase } from '../../lib/supabase'
import { StatCard } from '../common/StatCard'
import { StatusBadge } from '../common/StatusBadge'

export interface PublicShareViewProps {
  shareToken: string
}

export const PublicShareView: React.FC<PublicShareViewProps> = ({ shareToken }) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [account, setAccount] = useState<TradingAccount | null>(null)
  const [state, setState] = useState<any>(null)
  const [events, setEvents] = useState<TradeEvent[]>([])
  const [lastSyncAt, setLastSyncAt] = useState<Date>(new Date())

  // Load account by share token
  const loadSharedAccount = useCallback(async () => {
    try {
      // Find account where share_settings->>token = shareToken
      const { data: accounts, error: accError } = await supabase
        .from('trading_accounts')
        .select('*')

      if (accError) throw accError

      const matchingAccount = (accounts || []).find(
        (a: any) =>
          a.share_settings?.enabled &&
          a.share_settings?.token === shareToken
      )

      if (!matchingAccount) {
        setError('This shared dashboard is disabled or the link has expired.')
        setLoading(false)
        return
      }

      setAccount(matchingAccount)

      // Fetch state
      const { data: stateData } = await supabase
        .from('ea_states')
        .select('*')
        .eq('account_id', matchingAccount.id)
        .maybeSingle()

      if (stateData) {
        setState({
          ...(stateData.state || {}),
          updated_at: stateData.updated_at
        })
      }

      // Fetch trade events if history is allowed
      const showHistory = matchingAccount.share_settings?.permissions?.showHistory !== false
      if (showHistory) {
        const { data: eventData } = await supabase
          .from('trade_events')
          .select('*')
          .eq('master_account_id', matchingAccount.id)
          .order('created_at', { ascending: false })
          .limit(30)

        if (eventData) {
          setEvents(eventData as TradeEvent[])
        }
      }

      setLastSyncAt(new Date())
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Failed to load shared terminal.')
    } finally {
      setLoading(false)
    }
  }, [shareToken])

  useEffect(() => {
    void loadSharedAccount()
    const interval = setInterval(loadSharedAccount, 2000)
    return () => clearInterval(interval)
  }, [loadSharedAccount])

  const perms = account?.share_settings?.permissions || {
    showBalance: true,
    showEquity: true,
    showPl: true,
    showPositions: true,
    showHistory: true,
    showBroker: true
  }

  const isOnline = isAccountOnline(account, state)
  const balance = state?.balance ?? account?.balance ?? 0
  const equity = state?.equity ?? account?.equity ?? 0
  const openPl = state?.openPL ?? account?.open_pl ?? (equity - balance)
  const positions: PositionItem[] = state?.positions ?? []
  const symbol = state?.symbol ?? account?.symbol ?? 'XAUUSD'

  if (loading && !account) {
    return (
      <div className="publicShareLoadingScreen">
        <div className="loadingSpinner" />
        <p>Connecting to Live MT5 Terminal...</p>
      </div>
    )
  }

  if (error || !account) {
    return (
      <div className="publicShareErrorScreen glass">
        <Lock size={48} className="textAmber" />
        <h2>Dashboard Unavailable</h2>
        <p>{error || 'This share link is no longer valid.'}</p>
        <small className="textDim">Contact the account owner for a fresh share link.</small>
      </div>
    )
  }

  return (
    <div className="publicShareAppShell">
      {/* Top Read-Only Monitor Header */}
      <header className="publicShareHeader glass">
        <div className="shareBrandLeft">
          <div className="brandLogoBadge">
            <ShieldCheck size={20} className="textAccent" />
          </div>
          <div>
            <div className="shareHeaderTag">
              <span>LIVE READ-ONLY MONITOR</span>
            </div>
            <h1 className="shareAccountTitle">{account.label}</h1>
            {perms.showBroker && (
              <div className="shareBrokerMeta">
                <span>{account.broker || 'MT5 Broker'}</span>
                <span>•</span>
                <span>{account.server || 'Server'}</span>
                {account.account_number && (
                  <>
                    <span>•</span>
                    <span className="mono">#{account.account_number}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="shareHeaderRight">
          <StatusBadge online={isOnline} />
          <div className="lastSyncPill">
            <Clock size={13} className="textDim" />
            <span className="mono">{formatClock(lastSyncAt)}</span>
          </div>
        </div>
      </header>

      {/* Main KPI Stats Grid */}
      <main className="publicShareContent">
        <section className="kpiMetricsGrid">
          {perms.showBalance && (
            <StatCard
              icon={<Wallet size={20} className="textAccent" />}
              title="Account Balance"
              value={moneyPlain(balance)}
              subtitle="Verified Account Balance"
            />
          )}

          {perms.showEquity && (
            <StatCard
              icon={<Activity size={20} className="textCyan" />}
              title="Current Equity"
              value={moneyPlain(equity)}
              subtitle={`Free Margin: ${moneyPlain(state?.freeMargin ?? equity)}`}
            />
          )}

          {perms.showPl && (
            <StatCard
              icon={<TrendingUp size={20} className={openPl >= 0 ? 'textEmerald' : 'textRose'} />}
              title="Floating Net P/L"
              value={money(openPl)}
              trend={openPl > 0 ? 'pos' : openPl < 0 ? 'neg' : 'neutral'}
              subtitle={`${positions.length} active position(s)`}
            />
          )}

          <StatCard
            icon={<Clock size={20} className="textPurple" />}
            title="Terminal Status"
            value={isOnline ? 'Online (Live)' : 'Offline'}
            subtitle={`Active Symbol: ${symbol}`}
            badge={isOnline ? 'Verified' : 'Waiting'}
          />
        </section>

        {/* Live Open Positions (if permitted) */}
        {perms.showPositions && (
          <section className="publicSectionCard glass animateFadeIn">
            <div className="cardHeader">
              <div className="cardHeaderTitle">
                <Activity size={18} className="textEmerald" />
                <h3>Live Open Positions ({positions.length})</h3>
              </div>
              <div className="headerNetPl">
                <span>Floating: </span>
                <strong className={`mono ${clsPL(openPl)}`}>{money(openPl)}</strong>
              </div>
            </div>

            {positions.length === 0 ? (
              <div className="emptyStateBox">
                <p>No open positions on this account currently.</p>
              </div>
            ) : (
              <div className="tableWrapper">
                <table className="dataTable">
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Symbol</th>
                      <th>Type</th>
                      <th>Volume</th>
                      <th>Open Price</th>
                      <th>Current Price</th>
                      <th>SL / TP</th>
                      <th>Floating P/L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(pos => (
                      <tr key={pos.ticket}>
                        <td className="mono textDim">#{pos.ticket}</td>
                        <td className="mono strong">{pos.symbol}</td>
                        <td>
                          <span className={`sideTag ${pos.type === 'BUY' ? 'tagBuy' : 'tagSell'}`}>
                            {pos.type}
                          </span>
                        </td>
                        <td className="mono">{pos.volume.toFixed(2)}</td>
                        <td className="mono">{pos.priceOpen.toFixed(2)}</td>
                        <td className="mono">{pos.priceCurrent ? pos.priceCurrent.toFixed(2) : '—'}</td>
                        <td className="mono textDim">
                          {pos.sl > 0 ? pos.sl.toFixed(2) : '—'} / {pos.tp > 0 ? pos.tp.toFixed(2) : '—'}
                        </td>
                        <td className={`mono strong ${clsPL(pos.profit)}`}>
                          {money(pos.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Closed Trades History (if permitted) */}
        {perms.showHistory && events.length > 0 && (
          <section className="publicSectionCard glass animateFadeIn" style={{ marginTop: '24px' }}>
            <div className="cardHeader">
              <div className="cardHeaderTitle">
                <Clock size={18} className="textCyan" />
                <h3>Recent Trade Activity Stream ({events.length})</h3>
              </div>
            </div>

            <div className="tableWrapper">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Volume</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map(evt => (
                    <tr key={evt.id}>
                      <td className="mono textDim">{formatDate(evt.event_timestamp || evt.created_at)}</td>
                      <td>
                        <span className="badgeDim mono">{evt.action}</span>
                      </td>
                      <td className="mono strong">{evt.symbol}</td>
                      <td>
                        <span className={`sideTag ${evt.side === 'BUY' ? 'tagBuy' : 'tagSell'}`}>
                          {evt.side || 'BUY'}
                        </span>
                      </td>
                      <td className="mono">{evt.volume ? evt.volume.toFixed(2) : '—'}</td>
                      <td className="mono">{evt.price ? evt.price.toFixed(2) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Read-Only Notice Footer */}
        <footer className="publicShareFooter glass">
          <Lock size={14} className="textDim" />
          <span>This is a secure read-only live monitor powered by MT5 Copy Engine Pro.</span>
        </footer>
      </main>
    </div>
  )
}

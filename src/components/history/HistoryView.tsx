import React, { useState } from 'react'
import {
  History,
  RefreshCw,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  Clock,
  Zap,
  Activity,
  Layers
} from 'lucide-react'
import type { TradeEvent } from '../../lib/types'
import { formatDate, formatClock } from '../../lib/formatters'

export interface HistoryViewProps {
  events: TradeEvent[]
  onRefresh: () => void
}

export const HistoryView: React.FC<HistoryViewProps> = ({ events, onRefresh }) => {
  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState('ALL')

  const filteredEvents = events.filter(e => {
    const matchesSearch =
      !search ||
      e.symbol?.toLowerCase().includes(search.toLowerCase()) ||
      e.event_id?.toLowerCase().includes(search.toLowerCase()) ||
      e.action?.toLowerCase().includes(search.toLowerCase())

    const matchesAction = filterAction === 'ALL' || e.action === filterAction

    return matchesSearch && matchesAction
  })

  return (
    <div className="historyPageWrapper glass">
      {/* Header & Controls */}
      <div className="historyHeader">
        <div className="historyTitleBlock">
          <div className="titleBadge">Auditable Replication Stream</div>
          <h2>Trade Events & Copied Executions</h2>
          <p>Real-time log of all master orders, downstream slave executions, and trade modifications.</p>
        </div>

        <div className="historyHeaderActions">
          <button type="button" className="ghostBtn secondaryBtn" onClick={onRefresh}>
            <RefreshCw size={15} />
            <span>Refresh Events</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="historyFilterBar">
        <div className="searchFieldWrapper">
          <Search size={16} className="searchIcon" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by Symbol (e.g. XAUUSD), Event ID, or Action..."
            className="searchInput"
          />
        </div>

        <div className="filterSelectWrapper">
          <Filter size={15} className="filterIcon" />
          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="styledSelect compactSelect"
          >
            <option value="ALL">All Actions</option>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
            <option value="OPEN_MARKET">OPEN MARKET</option>
            <option value="CLOSE_MARKET">CLOSE MARKET</option>
            <option value="PARTIAL_CLOSE">PARTIAL CLOSE</option>
            <option value="MODIFY_SL_TP">MODIFY SL/TP</option>
            <option value="FIRST_BREAK_EVEN">BREAK EVEN</option>
          </select>
        </div>
      </div>

      {/* Events Table for Desktop & Cards for Mobile */}
      {filteredEvents.length === 0 ? (
        <div className="historyEmptyState">
          <History size={36} className="textDim" />
          <h4>No Trade Events Recorded</h4>
          <p>
            {search || filterAction !== 'ALL'
              ? 'No events match your search criteria.'
              : 'As soon as Master terminals dispatch trades, auditable replication logs will appear here in real-time.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="historyTableWrapper desktopOnly">
            <table className="historyTable">
              <thead>
                <tr>
                  <th>Event ID</th>
                  <th>Action</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Volume</th>
                  <th>Price</th>
                  <th>SL / TP</th>
                  <th>Executions</th>
                  <th style={{ textAlign: 'right' }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map(e => {
                  const isBuy = e.side === 'BUY'
                  const isSell = e.side === 'SELL'

                  return (
                    <tr key={e.id} className="historyRow">
                      <td>
                        <code className="mono eventIdCode">{e.event_id || e.id.slice(0, 8)}</code>
                      </td>

                      <td>
                        <span className="actionBadge">{e.action}</span>
                      </td>

                      <td>
                        <strong>{e.symbol}</strong>
                      </td>

                      <td>
                        <span className={`sideTag ${isBuy ? 'buyTag' : isSell ? 'sellTag' : 'neutralTag'}`}>
                          {isBuy ? <TrendingUp size={12} /> : isSell ? <TrendingDown size={12} /> : null}
                          <span>{e.side || 'MARKET'}</span>
                        </span>
                      </td>

                      <td className="mono fontMedium">
                        {e.volume !== undefined ? e.volume.toFixed(2) : '—'}
                      </td>

                      <td className="mono">
                        {e.price ? e.price.toFixed(2) : '—'}
                      </td>

                      <td className="mono textMuted">
                        {e.sl ? `${e.sl.toFixed(2)} / ${e.tp ? e.tp.toFixed(2) : '—'}` : '—'}
                      </td>

                      <td>
                        {e.trade_executions && e.trade_executions.length > 0 ? (
                          <div className="executionBadges">
                            {e.trade_executions.map((ex, idx) => (
                              <span
                                key={idx}
                                className={`execBadge tag-${ex.status.toLowerCase()}`}
                                title={`Latency: ${ex.execution_latency_ms || 0}ms ${ex.error_message ? `| ${ex.error_message}` : ''}`}
                              >
                                {ex.trading_accounts?.label || 'Slave'}: {ex.status}
                                {ex.execution_latency_ms ? ` (${ex.execution_latency_ms}ms)` : ''}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="textDim mono">Direct</span>
                        )}
                      </td>

                      <td className="mono textDim" style={{ textAlign: 'right' }}>
                        {formatClock(e.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Event Cards */}
          <div className="historyCardsWrapper mobileOnly">
            {filteredEvents.map(e => {
              const isBuy = e.side === 'BUY'
              const isSell = e.side === 'SELL'

              return (
                <div key={e.id} className="historyCard glass">
                  <div className="historyCardTop">
                    <div className="cardTopLeft">
                      <span className="actionBadge">{e.action}</span>
                      <strong className="cardSymbol">{e.symbol}</strong>
                    </div>
                    <span className="mono cardTime textDim">{formatClock(e.created_at)}</span>
                  </div>

                  <div className="historyCardDetails">
                    <div className="detailItem">
                      <span className="label">Side:</span>
                      <span className={`sideTag ${isBuy ? 'buyTag' : isSell ? 'sellTag' : 'neutralTag'}`}>
                        {e.side || 'MARKET'}
                      </span>
                    </div>
                    <div className="detailItem">
                      <span className="label">Volume:</span>
                      <strong className="mono">{e.volume !== undefined ? `${e.volume.toFixed(2)} Lot` : '—'}</strong>
                    </div>
                    <div className="detailItem">
                      <span className="label">Price:</span>
                      <span className="mono">{e.price ? e.price.toFixed(2) : '—'}</span>
                    </div>
                  </div>

                  {e.trade_executions && e.trade_executions.length > 0 && (
                    <div className="mobileExecutions">
                      <span className="execTitle">Slave Executions:</span>
                      <div className="execList">
                        {e.trade_executions.map((ex, idx) => (
                          <div key={idx} className={`execPill status-${ex.status.toLowerCase()}`}>
                            <span>{ex.trading_accounts?.label || 'Slave'}:</span>
                            <strong>{ex.status}</strong>
                            {ex.execution_latency_ms && <small>{ex.execution_latency_ms}ms</small>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

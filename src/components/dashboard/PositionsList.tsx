import React, { useState } from 'react'
import {
  Activity,
  Layers,
  Percent,
  Shield,
  XCircle,
  Pencil,
  Check,
  X,
  TrendingUp,
  TrendingDown
} from 'lucide-react'
import type { PositionItem } from '../../lib/types'
import { money, clsPL } from '../../lib/formatters'

export interface PositionsListProps {
  positions: PositionItem[]
  onClosePosition: (position: PositionItem) => void
  onClosePartial: (position: PositionItem, volume: number) => void
  onBreakEven: (position: PositionItem) => void
  onModifySlTp: (position: PositionItem, sl: number, tp: number) => void
}

export const PositionsList: React.FC<PositionsListProps> = ({
  positions,
  onClosePosition,
  onClosePartial,
  onBreakEven,
  onModifySlTp
}) => {
  const [editingTicket, setEditingTicket] = useState<string | number | null>(null)
  const [editSl, setEditSl] = useState<string>('')
  const [editTp, setEditTp] = useState<string>('')

  const startEdit = (p: PositionItem) => {
    setEditingTicket(p.ticket)
    setEditSl(p.sl ? p.sl.toString() : '')
    setEditTp(p.tp ? p.tp.toString() : '')
  }

  const saveEdit = (position: PositionItem) => {
    onModifySlTp(position, parseFloat(editSl) || 0, parseFloat(editTp) || 0)
    setEditingTicket(null)
  }

  if (positions.length === 0) {
    return (
      <div className="positionsEmptyState glass">
        <Activity size={32} className="emptyIcon textDim" />
        <h4>No Open Positions</h4>
        <p>There are no active trades open on this account.</p>
      </div>
    )
  }

  return (
    <div className="positionsContainer">
      {/* Desktop Table View */}
      <div className="positionsTableWrapper desktopOnly glass">
        <table className="positionsTable">
          <thead>
            <tr>
              <th>Ticket / Symbol</th>
              <th>Side</th>
              <th>Volume</th>
              <th>Open Price</th>
              <th>Current</th>
              <th>SL / TP</th>
              <th>Floating P/L</th>
              <th style={{ textAlign: 'right' }}>Quick Actions</th>
            </tr>
          </thead>
          <tbody>
            {positions.map(p => {
              const isEditing = editingTicket === p.ticket
              const isBuy = p.type === 'BUY'
              const plClass = clsPL(p.profit)

              return (
                <tr key={p.ticket} className="positionRow">
                  <td>
                    <div className="ticketSymbolCell">
                      <strong>{p.symbol}</strong>
                      <small className="mono textMuted">#{p.ticket}</small>
                    </div>
                  </td>

                  <td>
                    <span className={`sideTag ${isBuy ? 'buyTag' : 'sellTag'}`}>
                      {isBuy ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      <span>{p.type}</span>
                    </span>
                  </td>

                  <td className="mono fontMedium">{p.volume.toFixed(2)}</td>

                  <td className="mono">{p.priceOpen.toFixed(2)}</td>

                  <td className="mono">{p.priceCurrent ? p.priceCurrent.toFixed(2) : '—'}</td>

                  <td>
                    {isEditing ? (
                      <div className="inlineEditWrapper">
                        <input
                          type="number"
                          step="0.01"
                          value={editSl}
                          onChange={e => setEditSl(e.target.value)}
                          placeholder="SL"
                          className="compactInput mono"
                        />
                        <input
                          type="number"
                          step="0.01"
                          value={editTp}
                          onChange={e => setEditTp(e.target.value)}
                          placeholder="TP"
                          className="compactInput mono"
                        />
                        <button
                          type="button"
                          className="iconActionBtn saveBtn"
                          onClick={() => saveEdit(p)}
                          title="Save SL/TP"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          type="button"
                          className="iconActionBtn cancelBtn"
                          onClick={() => setEditingTicket(null)}
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="sltpDisplay" onClick={() => startEdit(p)}>
                        <span className="mono">{p.sl ? p.sl.toFixed(2) : '—'} / {p.tp ? p.tp.toFixed(2) : '—'}</span>
                        <Pencil size={12} className="editIcon" />
                      </div>
                    )}
                  </td>

                  <td>
                    <span className={`profitBadge mono ${plClass}`}>
                      {money(p.profit)}
                    </span>
                  </td>

                  <td>
                    <div className="actionButtonsGroup">
                      <button
                        type="button"
                        className="tableActionBtn beBtn"
                        onClick={() => onBreakEven(p)}
                        title="Move Stop Loss to Entry Price (Break-Even)"
                      >
                        BE
                      </button>
                      <button
                        type="button"
                        className="tableActionBtn partialBtn"
                        onClick={() => onClosePartial(p, +(p.volume / 2).toFixed(2))}
                        title="Close 50% of volume"
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        className="tableActionBtn closeBtn"
                        onClick={() => onClosePosition(p)}
                        title="Close full position"
                      >
                        Close
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="positionsCardsWrapper mobileOnly">
        {positions.map(p => {
          const isBuy = p.type === 'BUY'
          const plClass = clsPL(p.profit)
          const isEditing = editingTicket === p.ticket

          return (
            <div key={p.ticket} className="positionCard glass">
              <div className="posCardHeader">
                <div className="posHeaderLeft">
                  <span className={`sideTag ${isBuy ? 'buyTag' : 'sellTag'}`}>
                    {isBuy ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    <span>{p.type}</span>
                  </span>
                  <span className="posSymbol">{p.symbol}</span>
                  <span className="posLot mono">{p.volume.toFixed(2)} Lot</span>
                </div>
                <div className={`posProfit mono ${plClass}`}>
                  {money(p.profit)}
                </div>
              </div>

              <div className="posCardDetails">
                <div className="detailCol">
                  <span className="detailLabel">Open Price</span>
                  <span className="detailVal mono">{p.priceOpen.toFixed(2)}</span>
                </div>
                <div className="detailCol">
                  <span className="detailLabel">Current</span>
                  <span className="detailVal mono">{p.priceCurrent ? p.priceCurrent.toFixed(2) : '—'}</span>
                </div>
                <div className="detailCol">
                  <span className="detailLabel">Ticket</span>
                  <span className="detailVal mono">#{p.ticket}</span>
                </div>
              </div>

              <div className="posCardSlTp">
                {isEditing ? (
                  <div className="mobileInlineEdit">
                    <input
                      type="number"
                      step="0.01"
                      value={editSl}
                      onChange={e => setEditSl(e.target.value)}
                      placeholder="SL"
                      className="compactInput mono"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={editTp}
                      onChange={e => setEditTp(e.target.value)}
                      placeholder="TP"
                      className="compactInput mono"
                    />
                    <button
                      type="button"
                      className="saveBtn mobileEditBtn"
                      onClick={() => saveEdit(p)}
                    >
                      <Check size={14} /> Save
                    </button>
                    <button
                      type="button"
                      className="cancelBtn mobileEditBtn"
                      onClick={() => setEditingTicket(null)}
                    >
                      <X size={14} /> Cancel
                    </button>
                  </div>
                ) : (
                  <div className="mobileSltpRow" onClick={() => startEdit(p)}>
                    <span>SL: <strong className="mono">{p.sl ? p.sl.toFixed(2) : 'None'}</strong></span>
                    <span>TP: <strong className="mono">{p.tp ? p.tp.toFixed(2) : 'None'}</strong></span>
                    <button type="button" className="editSlTpBtn"><Pencil size={12} /> Edit</button>
                  </div>
                )}
              </div>

              <div className="posCardActions">
                <button
                  type="button"
                  className="mobileActionBtn beBtn"
                  onClick={() => onBreakEven(p)}
                >
                  Break Even (BE)
                </button>
                <button
                  type="button"
                  className="mobileActionBtn partialBtn"
                  onClick={() => onClosePartial(p, +(p.volume / 2).toFixed(2))}
                >
                  Close 50%
                </button>
                <button
                  type="button"
                  className="mobileActionBtn closeBtn"
                  onClick={() => onClosePosition(p)}
                >
                  Close Position
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

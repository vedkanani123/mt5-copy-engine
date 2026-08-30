import React, { useState, useCallback, useEffect } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Percent,
  Sliders,
  Sparkles,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  Target,
  Check,
  CircleAlert
} from 'lucide-react'
import type { TradingAccount, PositionItem } from '../../lib/types'

export type OrderType = 'MARKET' | 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP'

const rrOptions = [
  { ratio: 1.0, label: '1:1' },
  { ratio: 1.5, label: '1:1.5' },
  { ratio: 2.0, label: '1:2' },
  { ratio: 3.0, label: '1:3' },
  { ratio: 5.0, label: '1:5' }
]

export interface OrderTicketProps {
  account?: TradingAccount
  accounts: TradingAccount[]
  positions: PositionItem[]
  onExecuteTrade: (side: 'BUY' | 'SELL', payload: any) => void
  disabled?: boolean
}

export const OrderTicket: React.FC<OrderTicketProps> = ({
  account,
  positions,
  onExecuteTrade,
  disabled
}) => {
  const [orderType, setOrderType] = useState<OrderType>('MARKET')
  const [lot, setLot] = useState<number>(0.01)
  const [price, setPrice] = useState<string>('')
  const [slPrice, setSlPrice] = useState<string>('')
  const [tpPrice, setTpPrice] = useState<string>('')
  const [activeRr, setActiveRr] = useState<number | null>(2.0)

  const parsedSl = parseFloat(slPrice)
  const parsedEntry = parseFloat(price)
  const marketPrice = positions[0]?.priceCurrent || 0
  const rrBasePrice = !isNaN(parsedEntry) && parsedEntry > 0 ? parsedEntry : marketPrice
  const hasRequiredEntry = orderType === 'MARKET' || (!isNaN(parsedEntry) && parsedEntry > 0)
  const rrHasInputs = hasRequiredEntry && !isNaN(parsedSl) && parsedSl > 0 && rrBasePrice > 0 && Math.abs(rrBasePrice - parsedSl) > 0
  const rrPriceSource = orderType === 'MARKET' ? 'market price' : 'order price'

  // Fast lot step increments
  const handleLotChange = (delta: number) => {
    setLot(prev => {
      const next = Math.max(0.01, Math.round((prev + delta) * 100) / 100)
      return next
    })
  }

  // Auto-calculate TP when RR button is clicked or SL is entered
  const calculateTpFromRr = useCallback(
    (rrRatio: number, isBuySide: boolean = true) => {
      setActiveRr(rrRatio)
      const sl = parseFloat(slPrice)
      const entry = parseFloat(price)
      const currentMarket = positions[0]?.priceCurrent || 0

      const basePrice = !isNaN(entry) && entry > 0 ? entry : currentMarket
      if (!isNaN(sl) && sl > 0 && basePrice > 0) {
        const distance = Math.abs(basePrice - sl)
        if (distance > 0) {
          const calculatedTp = isBuySide
            ? basePrice + distance * rrRatio
            : basePrice - distance * rrRatio
          setTpPrice(calculatedTp.toFixed(2))
        }
      }
    },
    [slPrice, price, positions]
  )

  const handleOrder = (side: 'BUY' | 'SELL') => {
    if (disabled || !account) return

    const payload: any = {
      order_type: orderType,
      lot: lot,
      volume: lot,
      sl: parseFloat(slPrice) || 0,
      tp: parseFloat(tpPrice) || 0
    }

    if (orderType !== 'MARKET') {
      payload.price = parseFloat(price) || 0
    }

    onExecuteTrade(side, payload)
  }

  return (
    <div className="orderTicketCard glass">
      <div className="cardHeader">
        <div className="cardHeaderTitle">
          <Target size={18} className="textAccent" />
          <h3>Fast Execution Ticket</h3>
        </div>
        <div className="orderTypeSelect">
          <select
            value={orderType}
            onChange={e => setOrderType(e.target.value as OrderType)}
            className="styledSelect compactSelect"
          >
            <option value="MARKET">⚡ Market Order</option>
            <option value="BUY_LIMIT">Buy Limit</option>
            <option value="SELL_LIMIT">Sell Limit</option>
            <option value="BUY_STOP">Buy Stop</option>
            <option value="SELL_STOP">Sell Stop</option>
          </select>
        </div>
      </div>

      <div className="ticketBody">
        {/* Lot Size Selector with Steppers */}
        <div className="lotSection">
          <div className="sectionLabelRow">
            <span className="fieldLabel">Volume (Lots)</span>
            <span className="fieldValueDisplay mono">{lot.toFixed(2)} Lots</span>
          </div>

          <div className="lotInputRow">
            <button
              type="button"
              className="lotStepBtn"
              onClick={() => handleLotChange(-0.1)}
              title="-0.10"
            >
              -0.10
            </button>
            <button
              type="button"
              className="lotStepBtn"
              onClick={() => handleLotChange(-0.01)}
              title="-0.01"
            >
              -0.01
            </button>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max="100"
              value={lot}
              onChange={e => setLot(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
              className="lotNumberInput mono"
            />
            <button
              type="button"
              className="lotStepBtn"
              onClick={() => handleLotChange(0.01)}
              title="+0.01"
            >
              +0.01
            </button>
            <button
              type="button"
              className="lotStepBtn"
              onClick={() => handleLotChange(0.1)}
              title="+0.10"
            >
              +0.10
            </button>
          </div>

          <div className="lotQuickPills">
            {[0.01, 0.05, 0.1, 0.25, 0.5, 1.0].map(val => (
              <button
                key={val}
                type="button"
                className={`quickPill ${lot === val ? 'active' : ''}`}
                onClick={() => setLot(val)}
              >
                {val}
              </button>
            ))}
          </div>
        </div>

        {/* Limit/Stop Price if not market */}
        {orderType !== 'MARKET' && (
          <div className="formField ticketField animateFadeIn">
            <label>Order Price</label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="e.g. 2650.50"
              className="mono"
            />
          </div>
        )}

        {/* Stop Loss & Take Profit with RR Calculator */}
        <div className="slTpGrid">
          <div className="formField ticketField">
            <div className="fieldLabelRow">
              <label>Stop Loss (SL)</label>
            </div>
            <input
              type="number"
              step="0.01"
              value={slPrice}
              onChange={e => setSlPrice(e.target.value)}
              placeholder="e.g. 2640.00"
              className="mono"
            />
          </div>

          <div className="formField ticketField">
            <div className="fieldLabelRow">
              <label>Take Profit (TP)</label>
            </div>
            <input
              type="number"
              step="0.01"
              value={tpPrice}
              onChange={e => setTpPrice(e.target.value)}
              placeholder="e.g. 2670.00"
              className="mono"
            />
          </div>
        </div>

        {/* 1-Click Risk/Reward Multipliers */}
        <section className="rrSection" aria-labelledby="rrTargetHeading">
          <div className="rrHeader">
            <div className="rrTitleGroup">
              <span className="rrIcon" aria-hidden="true">
                <Target size={15} />
              </span>
              <div>
                <span className="rrEyebrow">TP HELPER</span>
                <h4 id="rrTargetHeading">Risk / reward target</h4>
              </div>
            </div>
            <div className={`rrActiveBadge ${activeRr === null ? 'isUnset' : ''}`} aria-live="polite">
              <span>Target</span>
              <strong>{activeRr === null ? 'Not set' : `1:${activeRr}`}</strong>
            </div>
          </div>

          <p className="rrDescription">Select a target; TP updates from your SL.</p>

          <div className="rrControlRow">
            <div className="rrButtonGroup" role="group" aria-label="Take profit risk to reward target">
              {rrOptions.map(item => (
                <button
                  key={item.ratio}
                  type="button"
                  className={`rrBtn ${activeRr === item.ratio ? 'active' : ''}`}
                  onClick={() => calculateTpFromRr(item.ratio, true)}
                  aria-pressed={activeRr === item.ratio}
                  aria-label={`Set take profit target to ${item.label}`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className={`rrState ${rrHasInputs ? 'ready' : 'needsInput'}`} aria-live="polite">
              {rrHasInputs ? <Check size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}
              <span>
                {rrHasInputs
                  ? `TP calculated from SL + ${rrPriceSource}`
                  : orderType === 'MARKET'
                    ? 'Enter SL to calculate TP'
                    : 'Enter SL and order price to calculate TP'}
              </span>
            </div>
          </div>

          <p className="rrHint">For pending orders, enter the order price first. Review TP before placing BUY or SELL.</p>
        </section>

        {/* Big Tactile Buy / Sell Trigger Buttons */}
        <div className="ticketActionButtons">
          <button
            type="button"
            className="tradeBtn buyBtn"
            onClick={() => handleOrder('BUY')}
            disabled={disabled || !account}
          >
            <div className="tradeBtnContent">
              <div className="tradeBtnIcon">
                <ArrowUpRight size={22} />
              </div>
              <div className="tradeBtnText">
                <span className="tradeAction">BUY / LONG</span>
                <span className="tradeLot">{lot.toFixed(2)} Lots</span>
              </div>
            </div>
          </button>

          <button
            type="button"
            className="tradeBtn sellBtn"
            onClick={() => handleOrder('SELL')}
            disabled={disabled || !account}
          >
            <div className="tradeBtnContent">
              <div className="tradeBtnIcon">
                <ArrowDownRight size={22} />
              </div>
              <div className="tradeBtnText">
                <span className="tradeAction">SELL / SHORT</span>
                <span className="tradeLot">{lot.toFixed(2)} Lots</span>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

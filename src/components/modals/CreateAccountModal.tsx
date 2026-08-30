import React, { useState } from 'react'
import {
  Crown,
  Zap,
  X,
  Plus,
  Shield,
  Server,
  Layers,
  Sparkles,
  ArrowRight
} from 'lucide-react'
import type { TradingAccount } from '../../lib/types'
import { supabase } from '../../lib/supabase'

export interface CreateAccountModalProps {
  mode?: 'master' | 'slave'
  initialMode?: 'master' | 'slave'
  preselectedMasterId?: string
  accounts?: TradingAccount[]
  masterAccounts?: TradingAccount[]
  onClose: () => void
  onSuccess: (creds: { id: string; key: string; label: string; mode: 'MASTER' | 'SLAVE' }) => void
  toast: (msg: string) => void
}

export const CreateAccountModal: React.FC<CreateAccountModalProps> = ({
  mode,
  initialMode = 'master',
  preselectedMasterId,
  accounts = [],
  masterAccounts: propMasterAccounts,
  onClose,
  onSuccess,
  toast
}) => {
  const activeMode = mode || initialMode || 'master'
  const safeAccounts = Array.isArray(accounts) ? accounts : []
  const masterAccounts = propMasterAccounts || safeAccounts.filter(a => a.mode === 'MASTER')
  const slaveCount = safeAccounts.filter(a => a.mode === 'SLAVE').length
  const [role, setRole] = useState<'MASTER' | 'SLAVE'>(activeMode === 'master' ? 'MASTER' : 'SLAVE')
  const [label, setLabel] = useState(
    activeMode === 'master'
      ? 'Master MT5'
      : `Slave VPS ${slaveCount + 1}`
  )
  const [masterId, setMasterId] = useState<string>(
    preselectedMasterId || (activeMode === 'slave' ? masterAccounts[0]?.id || '' : '')
  )
  const [broker, setBroker] = useState('')
  const [server, setServer] = useState('')
  const [number, setNumber] = useState('')
  const [saving, setSaving] = useState(false)

  const handleRoleChange = (newRole: 'MASTER' | 'SLAVE') => {
    setRole(newRole)
    if (newRole === 'MASTER' && label.startsWith('Slave')) {
      setLabel('Master MT5')
    } else if (newRole === 'SLAVE' && label.startsWith('Master')) {
      setLabel(`Slave VPS ${slaveCount + 1}`)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      // 1. Insert into trading_accounts directly
      const { data: acc, error: accError } = await supabase
        .from('trading_accounts')
        .insert({
          label: label.trim(),
          mode: role,
          master_account_id: masterId || null,
          copy_status: 'ACTIVE',
          broker: broker.trim() || null,
          server: server.trim() || null,
          account_number: number.trim() || null
        })
        .select('id, workspace_id')
        .single()

      if (accError || !acc) {
        throw accError || new Error('Could not create trading account in database.')
      }

      // 2. Generate raw connection key and SHA-256 hash for ea_devices table
      const rawKey = `EA-${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(rawKey)
      )
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')

      const { error: devError } = await supabase.from('ea_devices').insert({
        workspace_id: acc.workspace_id,
        account_id: acc.id,
        device_name: label.trim(),
        credential_hash: hashHex
      })

      if (devError) throw devError

      onSuccess({
        id: acc.id,
        key: rawKey,
        label: label.trim(),
        mode: role
      })
    } catch (err: any) {
      toast(`Failed to create account connection: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modalBackdrop animateFadeIn" onClick={onClose}>
      <div className="modalCard glass animateSlideUp" onClick={e => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalHeaderTitle">
            <div className="titleBadge">New Connection</div>
            <h3>Connect MT5 Account</h3>
            <p>Generate a 1-Click Key for your MetaTrader 5 Expert Advisor.</p>
          </div>
          <button type="button" className="modalCloseBtn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Role Switcher Tabs */}
        <div className="roleSwitcherGrid">
          <button
            type="button"
            className={`roleSwitchBtn ${role === 'MASTER' ? 'activeMaster' : ''}`}
            onClick={() => handleRoleChange('MASTER')}
          >
            <Crown size={18} className="crownGold" />
            <div className="roleBtnText">
              <strong>MASTER ACCOUNT</strong>
              <small>Dispatches trades to slaves</small>
            </div>
          </button>

          <button
            type="button"
            className={`roleSwitchBtn ${role === 'SLAVE' ? 'activeSlave' : ''}`}
            onClick={() => handleRoleChange('SLAVE')}
          >
            <Zap size={18} className="zapGlow" />
            <div className="roleBtnText">
              <strong>SLAVE COPIER</strong>
              <small>Replicates master orders</small>
            </div>
          </button>
        </div>

        <form onSubmit={handleCreate} className="modalForm">
          <div className="formField modalField">
            <label htmlFor="masterSelect">
              {role === 'SLAVE' ? 'Copy trades from master' : 'Connect this master under another master (optional)'}
            </label>
            <select
              id="masterSelect"
              value={masterId}
              onChange={e => setMasterId(e.target.value)}
              className="styledSelect"
            >
              {role === 'MASTER' && <option value="">Standalone master cluster</option>}
              {masterAccounts.length > 0 ? (
                masterAccounts.map(m => (
                  <option key={m.id} value={m.id}>
                    👑 {m.label} ({m.server || 'MT5'})
                  </option>
                ))
              ) : (
                <option value="">(No master accounts yet)</option>
              )}
            </select>
            <small className="fieldHint">
              Copy is ON by default. Turn it OFF later on that account if it should skip trades.
            </small>
          </div>

          {/* Account Label */}
          <div className="formField modalField">
            <label htmlFor="accountLabel">Account Name / Label</label>
            <input
              id="accountLabel"
              type="text"
              required
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={role === 'MASTER' ? 'e.g. FP Live Master 100k' : 'e.g. Prop Firm Slave 50k'}
            />
          </div>

          {/* MT5 Account Number */}
          <div className="formField modalField">
            <label htmlFor="accountNumber">MT5 Account Number (Optional)</label>
            <input
              id="accountNumber"
              type="text"
              value={number}
              onChange={e => setNumber(e.target.value)}
              placeholder="e.g. 415901603"
              className="mono"
            />
          </div>

          {/* Broker & Server row */}
          <div className="formRow dualColumn modalDualRow">
            <div className="formField modalField">
              <label htmlFor="brokerName">Broker Name (Optional)</label>
              <input
                id="brokerName"
                type="text"
                value={broker}
                onChange={e => setBroker(e.target.value)}
                placeholder="e.g. Exness / FTMO"
              />
            </div>

            <div className="formField modalField">
              <label htmlFor="serverName">Server Name (Optional)</label>
              <input
                id="serverName"
                type="text"
                value={server}
                onChange={e => setServer(e.target.value)}
                placeholder="e.g. Exness-Real21"
              />
            </div>
          </div>

          <div className="modalFooterActions">
            <button type="button" className="ghostBtn modalCancelBtn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="primaryBtn modalSubmitBtn"
              disabled={saving}
            >
              {saving ? (
                'Generating Connection Key...'
              ) : (
                <>
                  <span>Create {role === 'MASTER' ? '👑 Master' : '⚡ Slave'} Connection</span>
                  <Sparkles size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import {
  X,
  Link2,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Smartphone,
  Users,
  Lock,
  Share2,
  ShieldCheck,
  Sliders
} from 'lucide-react'
import type { TradingAccount } from '../../lib/types'
import { supabase } from '../../lib/supabase'

export interface SharePermissions {
  showBalance: boolean
  showEquity: boolean
  showPl: boolean
  showPositions: boolean
  showHistory: boolean
  showBroker: boolean
  maxDevices: number
}

const DEFAULT_PERMISSIONS: SharePermissions = {
  showBalance: true,
  showEquity: true,
  showPl: true,
  showPositions: true,
  showHistory: true,
  showBroker: true,
  maxDevices: 0 // 0 = unlimited
}

export interface ShareSettingsModalProps {
  account: TradingAccount
  onClose: () => void
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onUpdated?: () => void
}

export const ShareSettingsModal: React.FC<ShareSettingsModalProps> = ({
  account,
  onClose,
  toast,
  onUpdated
}) => {
  const existingSettings = (account as any).share_settings || {}
  const [enabled, setEnabled] = useState<boolean>(Boolean(existingSettings.enabled))
  const [token, setToken] = useState<string>(existingSettings.token || '')
  const [permissions, setPermissions] = useState<SharePermissions>({
    ...DEFAULT_PERMISSIONS,
    ...(existingSettings.permissions || {})
  })
  const [revealed, setRevealed] = useState<boolean>(false)
  const [copied, setCopied] = useState<boolean>(false)
  const [saving, setSaving] = useState<boolean>(false)

  // Generate or rotate token
  const generateNewToken = () => {
    const raw = crypto.randomUUID().replace(/-/g, '')
    return `tcx_${raw.slice(0, 16)}`
  }

  // Handle Token generation
  const handleCreateOrRotateLink = async () => {
    setSaving(true)
    try {
      const nextToken = generateNewToken()
      const updatedShare = {
        enabled: true,
        token: nextToken,
        permissions,
        created_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('trading_accounts')
        .update({ share_settings: updatedShare })
        .eq('id', account.id)

      if (error) throw error

      setToken(nextToken)
      setEnabled(true)
      setRevealed(true)
      toast('New share link generated and active.', 'success')
      if (onUpdated) onUpdated()
    } catch (err: any) {
      toast(`Failed to create share link: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Handle Enable / Disable Toggle
  const handleToggleEnable = async (nextState: boolean) => {
    setSaving(true)
    try {
      const nextToken = token || generateNewToken()
      const updatedShare = {
        enabled: nextState,
        token: nextToken,
        permissions,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('trading_accounts')
        .update({ share_settings: updatedShare })
        .eq('id', account.id)

      if (error) throw error

      setEnabled(nextState)
      if (!token) setToken(nextToken)
      toast(nextState ? 'Public share link enabled.' : 'Public share link disabled.', 'success')
      if (onUpdated) onUpdated()
    } catch (err: any) {
      toast(`Failed to update share access: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Handle Permission change
  const handlePermissionToggle = async (key: keyof SharePermissions) => {
    const nextPermissions = {
      ...permissions,
      [key]: !permissions[key]
    }
    setPermissions(nextPermissions)

    if (token) {
      try {
        await supabase
          .from('trading_accounts')
          .update({
            share_settings: {
              enabled,
              token,
              permissions: nextPermissions,
              updated_at: new Date().toISOString()
            }
          })
          .eq('id', account.id)
        if (onUpdated) onUpdated()
      } catch (err) {
        console.error('Failed to auto-save permissions', err)
      }
    }
  }

  // Handle Device limit change
  const handleDeviceLimitChange = async (maxDevices: number) => {
    const nextPermissions = {
      ...permissions,
      maxDevices
    }
    setPermissions(nextPermissions)

    if (token) {
      try {
        await supabase
          .from('trading_accounts')
          .update({
            share_settings: {
              enabled,
              token,
              permissions: nextPermissions,
              updated_at: new Date().toISOString()
            }
          })
          .eq('id', account.id)
        toast(maxDevices === 0 ? 'Unlimited devices allowed.' : `Limited to ${maxDevices} device(s).`, 'info')
        if (onUpdated) onUpdated()
      } catch (err) {
        console.error('Failed to update device limit', err)
      }
    }
  }

  const shareUrl = token ? `${window.location.origin}/?share=${token}` : ''

  const handleCopyLink = () => {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    toast('Public share link copied to clipboard!', 'success')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="modalBackdrop animateFadeIn" onClick={onClose}>
      <div
        className="modalContainer shareModalContainer glass animateSlideUp"
        onClick={e => e.stopPropagation()}
      >
        <div className="modalHeader">
          <div className="modalTitleGroup">
            <div className="modalIconBadge textAccent">
              <Share2 size={20} />
            </div>
            <div>
              <h3>Share Account Dashboard</h3>
              <p>Create a live, read-only monitor link for <strong>{account.label}</strong>.</p>
            </div>
          </div>
          <button type="button" className="closeModalBtn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="shareModalBody">
          {/* Share Access Toggle Row */}
          <div className="shareAccessToggleRow glass">
            <div className="shareAccessInfo">
              <span className="accessTitle">Public Share Link</span>
              <small className="textDim">
                {enabled ? 'Link is active and accessible' : 'Link is disabled / offline'}
              </small>
            </div>

            <button
              type="button"
              className={`shareSwitchBtn ${enabled ? 'switchActive' : 'switchPaused'}`}
              onClick={() => handleToggleEnable(!enabled)}
              disabled={saving}
            >
              <span className="switchThumb" />
              <span>{enabled ? 'ENABLED' : 'DISABLED'}</span>
            </button>
          </div>

          {/* Granular Visibility Permissions */}
          <div className="permissionsSection glass">
            <div className="sectionHead">
              <Sliders size={16} className="textCyan" />
              <h4>Select What Information Viewers Can See</h4>
            </div>
            <p className="sectionSubText">
              Choose exactly which cards and details to show. Connected accounts and trade execution are always hidden.
            </p>

            <div className="permissionsGrid">
              <label className="permCheckLabel">
                <input
                  type="checkbox"
                  checked={permissions.showBalance}
                  onChange={() => handlePermissionToggle('showBalance')}
                  className="styledCheckbox"
                />
                <span>Account Balance</span>
              </label>

              <label className="permCheckLabel">
                <input
                  type="checkbox"
                  checked={permissions.showEquity}
                  onChange={() => handlePermissionToggle('showEquity')}
                  className="styledCheckbox"
                />
                <span>Current Equity</span>
              </label>

              <label className="permCheckLabel">
                <input
                  type="checkbox"
                  checked={permissions.showPl}
                  onChange={() => handlePermissionToggle('showPl')}
                  className="styledCheckbox"
                />
                <span>Net Profit / Loss</span>
              </label>

              <label className="permCheckLabel">
                <input
                  type="checkbox"
                  checked={permissions.showPositions}
                  onChange={() => handlePermissionToggle('showPositions')}
                  className="styledCheckbox"
                />
                <span>Live Open Trades</span>
              </label>

              <label className="permCheckLabel">
                <input
                  type="checkbox"
                  checked={permissions.showHistory}
                  onChange={() => handlePermissionToggle('showHistory')}
                  className="styledCheckbox"
                />
                <span>Closed Trade History</span>
              </label>

              <label className="permCheckLabel">
                <input
                  type="checkbox"
                  checked={permissions.showBroker}
                  onChange={() => handlePermissionToggle('showBroker')}
                  className="styledCheckbox"
                />
                <span>Broker & Server Info</span>
              </label>
            </div>
          </div>

          {/* Device Limit & Security Settings */}
          <div className="deviceLimitRow glass">
            <div className="deviceLimitLeft">
              <Smartphone size={16} className="textPurple" />
              <div>
                <span>Device Limit</span>
                <small className="textDim">Maximum concurrent devices allowed to open this link</small>
              </div>
            </div>

            <select
              value={permissions.maxDevices}
              onChange={e => handleDeviceLimitChange(Number(e.target.value))}
              className="styledSelect miniSelect"
            >
              <option value={0}>Unlimited Devices</option>
              <option value={1}>1 Device Only</option>
              <option value={2}>2 Devices</option>
              <option value={3}>3 Devices</option>
              <option value={5}>5 Devices</option>
              <option value={10}>10 Devices</option>
            </select>
          </div>

          {/* Share Link Generation & Display */}
          {token ? (
            <div className="shareLinkDisplayBlock glass">
              <div className="shareLinkHeader">
                <span className="linkBlockTitle">Live Share URL</span>
                <button
                  type="button"
                  className="ghostBtn miniBtn"
                  onClick={() => setRevealed(!revealed)}
                >
                  {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                  <span>{revealed ? 'Hide URL' : 'Show URL'}</span>
                </button>
              </div>

              <div className="shareUrlBox">
                {revealed ? (
                  <code className="shareUrlText mono">{shareUrl}</code>
                ) : (
                  <span className="shareUrlMasked">••••••••••••••••••••••••••••••••••••••••</span>
                )}

                <button
                  type="button"
                  className="primaryBtn miniBtn copyBtn"
                  onClick={handleCopyLink}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="shareLinkActionsRow">
                <button
                  type="button"
                  className="ghostBtn miniBtn dangerMiniBtn"
                  onClick={handleCreateOrRotateLink}
                  disabled={saving}
                >
                  <RefreshCw size={13} />
                  <span>Rotate Link (Revoke Old)</span>
                </button>
                <small className="textDim">
                  <Lock size={12} /> Read-only access. Viewers cannot place trades.
                </small>
              </div>
            </div>
          ) : (
            <div className="noLinkBlock">
              <button
                type="button"
                className="primaryBtn fullBtn"
                onClick={handleCreateOrRotateLink}
                disabled={saving}
              >
                <Link2 size={16} />
                <span>Generate Public Share Link</span>
              </button>
            </div>
          )}
        </div>

        <div className="modalFooter">
          <button type="button" className="primaryBtn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

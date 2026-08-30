import React, { useState } from 'react'
import {
  KeyRound,
  Copy,
  Check,
  X,
  Sparkles,
  Zap,
  CheckCircle2,
  Terminal
} from 'lucide-react'

export interface CredentialsModalProps {
  credentials: {
    id: string
    key: string
    label: string
    mode?: 'MASTER' | 'SLAVE'
  }
  onClose: () => void
  onRotate?: () => void | Promise<void>
  toast: (msg: string) => void
}

export const CredentialsModal: React.FC<CredentialsModalProps> = ({
  credentials,
  onClose,
  onRotate,
  toast
}) => {
  const [copiedId, setCopiedId] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const connectionKey = credentials.key && credentials.key !== 'Stored in MT5'
    ? `${credentials.id}|${credentials.key}`
    : credentials.id

  const copyId = () => {
    navigator.clipboard.writeText(connectionKey)
    setCopiedId(true)
    toast('Copied the complete MT5 connection key to clipboard!')
    setTimeout(() => setCopiedId(false), 2500)
  }

  const copyRawKey = () => {
    navigator.clipboard.writeText(credentials.key)
    setCopiedKey(true)
    toast('Copied Raw EA Key to clipboard!')
    setTimeout(() => setCopiedKey(false), 2500)
  }

  return (
    <div className="modalBackdrop animateFadeIn" onClick={onClose}>
      <div className="modalCard glass credsModalCard animateSlideUp" onClick={e => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalHeaderTitle">
            <div className="titleBadge successBadge">Connection Ready</div>
            <h3>{credentials.label} Connected</h3>
            <p>Paste this 1-Click Connection Key into your MT5 EA parameters.</p>
          </div>
          <button type="button" className="modalCloseBtn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="credsModalBody">
          {/* Main 1-Click Key Box */}
          <div className="keyBoxPrimary">
            <div className="keyBoxHeader">
              <span className="keyBoxLabel">InpAccountKey (Account ID | Secret)</span>
              <span className="keyTag">Primary Key</span>
            </div>
            <div className="keyStringRow">
              <code className="keyStringCode mono">{connectionKey}</code>
              <button
                type="button"
                className={`keyCopyBtn ${copiedId ? 'copied' : ''}`}
                onClick={copyId}
              >
                {copiedId ? <Check size={16} /> : <Copy size={16} />}
                <span>{copiedId ? 'Copied' : 'Copy Key'}</span>
              </button>
            </div>
          </div>

          {credentials.key && credentials.key !== 'Stored in MT5' && (
            <div className="keyBoxSecondary">
              <div className="keyBoxHeader">
                <span className="keyBoxLabel">Secret token (stored hashed in Supabase)</span>
              </div>
              <div className="keyStringRow">
                <code className="keyStringCode mono textDim">{credentials.key}</code>
                <button
                  type="button"
                  className="keyCopyBtn miniCopyBtn"
                  onClick={copyRawKey}
                >
                  {copiedKey ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          {credentials.key === 'Stored in MT5' && onRotate && (
            <div className="noticeCard warningNotice glass">
              <div className="noticeCardText">
                <strong>Existing connection key not recoverable</strong>
                <p>Rotate it to generate a new secure key, then replace <code>InpAccountKey</code> in MT5.</p>
                <button type="button" className="ghostBtn miniBtn" onClick={onRotate}>
                  <KeyRound size={13} /> Rotate & Show New Key
                </button>
              </div>
            </div>
          )}

          {/* Setup Guide Info */}
          <div className="noticeCard glass">
            <div className="noticeCardIcon">
              <Sparkles size={18} className="textAccent" />
            </div>
            <div className="noticeCardText">
              <strong>Quick MT5 Setup:</strong>
              <p>
                In MT5, attach <code>CopyEngine.mq5</code> to the chart. Set <code>InpRole = {credentials.mode || 'MASTER'}</code> and paste the copied key above into <code>InpAccountKey</code>.
              </p>
            </div>
          </div>
        </div>

        <div className="modalFooterActions">
          <button type="button" className="primaryBtn fullBtn" onClick={onClose}>
            <CheckCircle2 size={16} />
            <span>Done — Go To Terminal</span>
          </button>
        </div>
      </div>
    </div>
  )
}

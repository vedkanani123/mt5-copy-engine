import React, { useState } from 'react'
import {
  User,
  Phone,
  Mail,
  Copy,
  Check,
  Server,
  KeyRound,
  Shield,
  HelpCircle,
  LogOut,
  ExternalLink,
  Code2,
  CheckCircle2,
  Terminal
} from 'lucide-react'
import type { TradingAccount } from '../../lib/types'
import { supabase } from '../../lib/supabase'

export interface SettingsViewProps {
  user: any
  accounts: TradingAccount[]
  emergencyStop: boolean
  onToggleEmergencyStop: () => void | Promise<void>
  toast: (msg: string) => void
}

export const SettingsView: React.FC<SettingsViewProps> = ({ user, accounts, emergencyStop, onToggleEmergencyStop, toast }) => {
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const userMeta = user?.user_metadata || {}
  const firstName = userMeta.first_name || ''
  const lastName = userMeta.last_name || ''
  const fullName = userMeta.full_name || (firstName ? `${firstName} ${lastName}`.trim() : user?.email?.split('@')[0] || 'Trader')
  const phone = userMeta.phone_number || 'Not provided'
  const email = user?.email || ''

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://drdfsvprjrewemhzkink.supabase.co'
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_iguy_M7cSoea6vasam_zmg_CYjpgUNU'

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(label)
    toast(`Copied ${label} to clipboard.`)
    setTimeout(() => setCopiedField(null), 2500)
  }

  return (
    <div className="settingsPageWrapper">
      <div className="settingsGrid">
        {/* Left Column: User Profile & Cloud Credentials */}
        <div className="settingsColumn">
          {/* User Profile Card */}
          <div className="settingsCard glass">
            <div className="cardHeader">
              <div className="cardHeaderTitle">
                <User size={18} className="textAccent" />
                <h3>Trader Account Profile</h3>
              </div>
            </div>

            <div className="profileHeroBlock">
              <div className="profileAvatarBig">
                <User size={28} />
              </div>
              <div className="profileHeroInfo">
                <h4 className="profileHeroName">{fullName}</h4>
                <span className="profileHeroEmail">{email}</span>
              </div>
            </div>

            <div className="profileFieldsGrid">
              <div className="profileFieldItem">
                <span className="fieldLabel">First Name</span>
                <strong className="fieldVal">{firstName || '—'}</strong>
              </div>

              <div className="profileFieldItem">
                <span className="fieldLabel">Second / Last Name</span>
                <strong className="fieldVal">{lastName || '—'}</strong>
              </div>

              <div className="profileFieldItem">
                <span className="fieldLabel">Full Name</span>
                <strong className="fieldVal">{fullName}</strong>
              </div>

              <div className="profileFieldItem">
                <span className="fieldLabel">Phone Number</span>
                <strong className="fieldVal mono">{phone}</strong>
              </div>

              <div className="profileFieldItem fullWidthField">
                <span className="fieldLabel">Email Address</span>
                <strong className="fieldVal mono">{email}</strong>
              </div>
            </div>

            <div className="profileCardFooter">
              <button
                type="button"
                className="ghostBtn dangerGhost fullBtn"
                onClick={() => supabase.auth.signOut()}
              >
                <LogOut size={16} />
                <span>Sign Out of Trading Terminal</span>
              </button>
            </div>
          </div>

          <div className={`settingsCard glass emergencySettingsCard ${emergencyStop ? 'emergencyEnabled' : ''}`}>
            <div className="cardHeader">
              <div className="cardHeaderTitle">
                <Shield size={18} className={emergencyStop ? 'textRose' : 'textEmerald'} />
                <h3>Workspace Emergency Stop</h3>
              </div>
              <button type="button" className={`toggleBtn ${emergencyStop ? 'toggleOn dangerToggle' : ''}`} onClick={onToggleEmergencyStop}>
                {emergencyStop ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>
            <p className="settingsCardDesc">
              {emergencyStop
                ? 'New master events are blocked from reaching linked slave accounts.'
                : 'Enable this before maintenance or if you need to halt new copy entries across the workspace.'}
            </p>
          </div>

          {/* Cloud API & WebRequest Credentials Card */}
          <div className="settingsCard glass">
            <div className="cardHeader">
              <div className="cardHeaderTitle">
                <Server size={18} className="textCyan" />
                <h3>Cloud WebRequest API Keys</h3>
              </div>
            </div>

            <p className="settingsCardDesc">
              Use these cloud credentials in your MT5 terminal settings to enable WebRequest synchronization.
            </p>

            <div className="copyRowsList">
              <div className="copyRowBox">
                <div className="copyRowInfo">
                  <span className="copyLabel">Supabase Cloud URL</span>
                  <code className="copyCode mono">{supabaseUrl}</code>
                </div>
                <button
                  type="button"
                  className="copyBtn"
                  onClick={() => copyToClipboard(supabaseUrl, 'Supabase URL')}
                >
                  {copiedField === 'Supabase URL' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>

              <div className="copyRowBox">
                <div className="copyRowInfo">
                  <span className="copyLabel">Publishable Anon Key</span>
                  <code className="copyCode mono">{supabaseKey}</code>
                </div>
                <button
                  type="button"
                  className="copyBtn"
                  onClick={() => copyToClipboard(supabaseKey, 'Anon Key')}
                >
                  {copiedField === 'Anon Key' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Step-by-Step MT5 Setup Guide */}
        <div className="settingsColumn">
          <div className="settingsCard glass">
            <div className="cardHeader">
              <div className="cardHeaderTitle">
                <Terminal size={18} className="textEmerald" />
                <h3>MT5 EA Connection Walkthrough</h3>
              </div>
              <span className="badgeDim">Zero-Setup Engine</span>
            </div>

            <div className="tutorialStepsList">
              <div className="tutorialStep">
                <div className="stepNumberBadge">1</div>
                <div className="stepContent">
                  <h5>Enable WebRequest in MT5</h5>
                  <p>In MetaTrader 5, open <strong>Tools → Options → Expert Advisors</strong>.</p>
                  <p>Check <strong>"Allow WebRequest for listed URL"</strong> and add:</p>
                  <div className="codeSnippet mono">
                    <span>{supabaseUrl}</span>
                    <button
                      type="button"
                      className="miniCopyIcon"
                      onClick={() => copyToClipboard(supabaseUrl, 'WebRequest URL')}
                    >
                      {copiedField === 'WebRequest URL' ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="tutorialStep">
                <div className="stepNumberBadge">2</div>
                <div className="stepContent">
                  <h5>Compile CopyEngine EA</h5>
                  <p>Use only the current <code>CopyEngine.mq5</code> from this project. Place it inside your MT5 <code>MQL5/Experts</code> directory and press <strong>F7 (Compile)</strong>. Do not use the old reference EA, because it uses a different API contract.</p>
                </div>
              </div>

              <div className="tutorialStep">
                <div className="stepNumberBadge">3</div>
                <div className="stepContent">
                  <h5>Create Master & Slave Connections</h5>
                  <p>Click <strong>"+ Connect EA"</strong> in the top header to create your Master account and generate its 1-Click Key.</p>
                </div>
              </div>

              <div className="tutorialStep">
                <div className="stepNumberBadge">4</div>
                <div className="stepContent">
                  <h5>Attach to Charts</h5>
                  <p>Attach <code>CopyEngine</code> to any chart on Master MT5, set <code>InpRole = MASTER</code>, and paste the complete <code>ACCOUNT_UUID|SECRET_TOKEN</code> into <code>InpAccountKey</code>.</p>
                  <p>For Slave copiers, set <code>InpRole = SLAVE</code> and paste each Slave's unique Connection Key.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

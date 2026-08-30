import React, { useState } from 'react'
import {
  Zap,
  Shield,
  Radio,
  ListChecks,
  User,
  Phone,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Activity,
  Layers
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

export interface AuthScreenProps {
  onAuthSuccess?: () => void
}

export const AuthScreen: React.FC<AuthScreenProps> = () => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  
  // Form fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  // UI states
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Handle first/last name changes and auto-sync full name if not custom
  const handleFirstNameChange = (val: string) => {
    setFirstName(val)
    setFullName(`${val} ${lastName}`.trim())
  }

  const handleLastNameChange = (val: string) => {
    setLastName(val)
    setFullName(`${firstName} ${val}`.trim())
  }

  const passwordsMatch = password.length > 0 && password === confirmPassword
  const passwordLengthOk = password.length >= 6

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    setLoading(true)

    try {
      if (mode === 'signup') {
        if (!passwordLengthOk) {
          throw new Error('Password must be at least 6 characters long.')
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match. Please verify your confirm password.')
        }
        if (!email.trim() || !email.includes('@')) {
          throw new Error('Please enter a valid email address.')
        }

        const calculatedFullName = fullName.trim() || `${firstName.trim()} ${lastName.trim()}`.trim() || 'Trader'

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              full_name: calculatedFullName,
              phone_number: phone.trim()
            }
          }
        })

        if (error) throw error

        if (data.session) {
          setSuccessMsg('Account created successfully! Logging you in...')
        } else {
          setSuccessMsg('Account registered successfully! Please check your email to confirm your account or sign in.')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password
        })

        if (error) throw error
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication request failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="authPageWrapper">
      <div className="authBackgroundBlobs">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
      </div>

      <div className="authContainer glass">
        {/* Left Side: Brand & Feature Showcase */}
        <div className="authHeroPanel">
          <div className="authBrandLogo">
            <div className="brandBadgeIcon">
              <Zap size={28} className="zapGlow" />
            </div>
            <div>
              <h1 className="brandTitle">TCX Engine</h1>
              <span className="brandSubtitle">Next-Gen Multi-Master MT5 Copier</span>
            </div>
          </div>

          <div className="heroContent">
            <h2>Ultra-Low Latency Cloud Copying for MetaTrader 5</h2>
            <p>
              Execute, synchronize, and protect trading accounts in real-time with zero broker strategy lag and sub-millisecond cloud replication.
            </p>

            <div className="featureList">
              <div className="featureItem">
                <div className="featureIcon"><Radio size={16} /></div>
                <div>
                  <strong>Live Multi-Master Replication</strong>
                  <span>Instant SL/TP & partial close synchronization</span>
                </div>
              </div>

              <div className="featureItem">
                <div className="featureIcon"><Shield size={16} /></div>
                <div>
                  <strong>Independent Risk Architecture</strong>
                  <span>Per-slave equity scaling and custom lot sizing</span>
                </div>
              </div>

              <div className="featureItem">
                <div className="featureIcon"><Activity size={16} /></div>
                <div>
                  <strong>Auditable Execution Stream</strong>
                  <span>Full visibility with execution latency & slippage logs</span>
                </div>
              </div>
            </div>
          </div>

          <div className="heroFooter">
            <div className="cloudBadge">
              <span className="statusDot pulse" />
              <span>Direct Supabase High-Speed Cloud Sync</span>
            </div>
          </div>
        </div>

        {/* Right Side: Auth Card Form */}
        <div className="authFormPanel">
          <div className="authFormHeader">
            <div className="tabSwitcher">
              <button
                type="button"
                className={`tabBtn ${mode === 'signin' ? 'active' : ''}`}
                onClick={() => {
                  setMode('signin')
                  setErrorMsg('')
                  setSuccessMsg('')
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`tabBtn ${mode === 'signup' ? 'active' : ''}`}
                onClick={() => {
                  setMode('signup')
                  setErrorMsg('')
                  setSuccessMsg('')
                }}
              >
                Create Account
              </button>
            </div>

            <div className="formTitleGroup">
              <h3>{mode === 'signin' ? 'Welcome Back, Trader' : 'Create Trading Workspace'}</h3>
              <p>
                {mode === 'signin'
                  ? 'Access your MT5 clusters and live execution cockpits.'
                  : 'Set up your cloud terminal with complete trader profile.'}
              </p>
            </div>
          </div>

          {errorMsg && (
            <div className="authAlert errorAlert animateFadeIn">
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="authAlert successAlert animateFadeIn">
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="authForm">
            {mode === 'signup' && (
              <>
                {/* First & Last Name */}
                <div className="formRow dualColumn">
                  <div className="formField">
                    <label htmlFor="firstName">First Name</label>
                    <div className="inputWrapper">
                      <User size={16} className="inputIcon" />
                      <input
                        id="firstName"
                        type="text"
                        required
                        value={firstName}
                        onChange={e => handleFirstNameChange(e.target.value)}
                        placeholder="John"
                        autoComplete="given-name"
                      />
                    </div>
                  </div>

                  <div className="formField">
                    <label htmlFor="lastName">Second / Last Name</label>
                    <div className="inputWrapper">
                      <User size={16} className="inputIcon" />
                      <input
                        id="lastName"
                        type="text"
                        required
                        value={lastName}
                        onChange={e => handleLastNameChange(e.target.value)}
                        placeholder="Doe"
                        autoComplete="family-name"
                      />
                    </div>
                  </div>
                </div>

                {/* Full Name & Phone Number */}
                <div className="formRow dualColumn">
                  <div className="formField">
                    <label htmlFor="fullName">Full Name</label>
                    <div className="inputWrapper">
                      <User size={16} className="inputIcon" />
                      <input
                        id="fullName"
                        type="text"
                        required
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        placeholder="John Doe"
                        autoComplete="name"
                      />
                    </div>
                  </div>

                  <div className="formField">
                    <label htmlFor="phone">Phone Number</label>
                    <div className="inputWrapper">
                      <Phone size={16} className="inputIcon" />
                      <input
                        id="phone"
                        type="tel"
                        required
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+1 (555) 019-2834"
                        autoComplete="tel"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Email Address */}
            <div className="formField">
              <label htmlFor="email">Email Address</label>
              <div className="inputWrapper">
                <Mail size={16} className="inputIcon" />
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="trader@tcxengine.io"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div className="formField">
              <div className="fieldLabelWithMeta">
                <label htmlFor="password">Password</label>
                {mode === 'signup' && (
                  <span className={`metaHint ${passwordLengthOk ? 'valid' : ''}`}>
                    Min 6 characters
                  </span>
                )}
              </div>
              <div className="inputWrapper">
                <Lock size={16} className="inputIcon" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  className="eyeToggleBtn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm Password (Sign up only) */}
            {mode === 'signup' && (
              <div className="formField">
                <div className="fieldLabelWithMeta">
                  <label htmlFor="confirmPassword">Confirm Password</label>
                  {confirmPassword.length > 0 && (
                    <span className={`metaHint ${passwordsMatch ? 'valid' : 'invalid'}`}>
                      {passwordsMatch ? '✓ Matches' : '✗ Passwords do not match'}
                    </span>
                  )}
                </div>
                <div className="inputWrapper">
                  <Lock size={16} className="inputIcon" />
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="eyeToggleBtn"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="submitBtn primaryBtn glowHover"
              disabled={loading || (mode === 'signup' && (!passwordsMatch || !passwordLengthOk))}
            >
              {loading ? (
                <span className="spinnerLabel">Processing Request...</span>
              ) : mode === 'signin' ? (
                <>
                  <span>Sign In to Terminal</span>
                  <ArrowRight size={18} />
                </>
              ) : (
                <>
                  <span>Complete Registration</span>
                  <Sparkles size={18} />
                </>
              )}
            </button>
          </form>

          <div className="authFormFooter">
            <p>
              {mode === 'signin' ? "Don't have an account yet?" : 'Already registered?'}
              <button
                type="button"
                className="linkSwitchBtn"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin')
                  setErrorMsg('')
                  setSuccessMsg('')
                }}
              >
                {mode === 'signin' ? 'Create one now' : 'Sign in here'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

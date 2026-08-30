import React from 'react'
import {
  Activity,
  Layers,
  History,
  Shield,
  Settings2
} from 'lucide-react'
import type { ViewType } from './Header'

export interface MobileNavProps {
  currentView: ViewType
  setView: (v: ViewType) => void
}

export const MobileNav: React.FC<MobileNavProps> = ({ currentView, setView }) => {
  const items: { id: ViewType; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Activity size={20} /> },
    { id: 'accounts', label: 'Accounts', icon: <Layers size={20} /> },
    { id: 'history', label: 'Audit', icon: <History size={20} /> },
    { id: 'rules', label: 'Rules', icon: <Shield size={20} /> },
    { id: 'settings', label: 'Settings', icon: <Settings2 size={20} /> }
  ]

  return (
    <div className="mobileBottomNavWrapper">
      <nav className="mobileBottomNav glass">
        {items.map(item => {
          const isActive = currentView === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={`mobileNavItem ${isActive ? 'active' : ''}`}
              onClick={() => setView(item.id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={`Open ${item.label}`}
            >
              <div className="navIconBox">
                {item.icon}
                {isActive && <span className="activeGlowDot" />}
              </div>
              <span className="navItemLabel">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

import React from 'react'
import { Wifi, WifiOff } from 'lucide-react'

export interface StatusBadgeProps {
  online: boolean
  label?: string
  pingMs?: number
  showIcon?: boolean
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  online,
  label,
  pingMs,
  showIcon = true
}) => {
  return (
    <span className={`statusBadge ${online ? 'statusOnline' : 'statusOffline'}`}>
      <span className="statusDot" />
      {showIcon && (online ? <Wifi size={12} className="statusIcon" /> : <WifiOff size={12} className="statusIcon" />)}
      <span className="statusText">{label || (online ? 'ONLINE' : 'OFFLINE')}</span>
      {online && pingMs !== undefined && pingMs > 0 && (
        <span className="statusPing">{pingMs}ms</span>
      )}
    </span>
  )
}

import React, { ReactNode } from 'react'

export interface StatCardProps {
  icon: ReactNode
  title: string
  value: string | number
  subtitle?: string
  trend?: 'pos' | 'neg' | 'neutral'
  badge?: string
  onClick?: () => void
}

export const StatCard: React.FC<StatCardProps> = ({
  icon,
  title,
  value,
  subtitle,
  trend,
  badge,
  onClick
}) => {
  return (
    <div className={`metricCard glass ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <div className="metricCardTop">
        <div className="metricIconBox">{icon}</div>
        {badge && <span className="metricBadge">{badge}</span>}
      </div>
      <div className="metricCardBody">
        <span className="metricLabel">{title}</span>
        <div className={`metricValue ${trend ? (trend === 'pos' ? 'posText' : trend === 'neg' ? 'negText' : '') : ''}`}>
          {value}
        </div>
        {subtitle && <span className="metricSubtitle">{subtitle}</span>}
      </div>
    </div>
  )
}

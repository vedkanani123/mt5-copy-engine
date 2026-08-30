import React from 'react'
import { Power } from 'lucide-react'
import type { CopyStatus } from '../../lib/types'
import { isCopyOn } from '../../lib/copy-cluster'

export interface CopySwitchProps {
  status: CopyStatus | string | null | undefined
  onToggle: (next: CopyStatus) => void
  size?: 'sm' | 'md'
  labelOn?: string
  labelOff?: string
}

export const CopySwitch: React.FC<CopySwitchProps> = ({
  status,
  onToggle,
  size = 'sm',
  labelOn = 'COPY ON',
  labelOff = 'COPY OFF'
}) => {
  const active = isCopyOn(status)

  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      className={`copySwitch ${active ? 'switchOn' : 'switchOff'} ${size === 'md' ? 'copySwitchMd' : ''}`}
      onClick={() => onToggle(active ? 'PAUSED' : 'ACTIVE')}
      title={active ? 'Copy is ON — this account takes copied trades' : 'Copy is OFF — this account will not take copied trades'}
    >
      <span className="copySwitchTrack">
        <span className="copySwitchKnob" />
      </span>
      <Power size={size === 'md' ? 12 : 10} />
      <span>{active ? labelOn : labelOff}</span>
    </button>
  )
}

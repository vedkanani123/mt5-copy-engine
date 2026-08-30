import React from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

export interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  onClose: () => void
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'success', onClose }) => {
  if (!message) return null

  return (
    <div className={`floatingToast toast-${type} glass animateSlideUp`}>
      <div className="toastIcon">
        {type === 'error' ? (
          <AlertCircle size={18} />
        ) : type === 'info' ? (
          <Info size={18} />
        ) : (
          <CheckCircle2 size={18} />
        )}
      </div>
      <div className="toastContent">{message}</div>
      <button type="button" className="toastCloseBtn" onClick={onClose} aria-label="Close notification">
        <X size={14} />
      </button>
    </div>
  )
}

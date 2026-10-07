import { useEffect } from 'react'

import {
  type SnackbarVariant,
  useSnackbarStore,
} from '../../stores/useSnackbarStore'
import { Icon } from './Icon'

type SnackbarProps = {
  message: string
  variant?: SnackbarVariant
  duration?: number
  onClose: () => void
}

const variantClasses: Record<SnackbarVariant, string> = {
  error: 'border-red-300 bg-red-700 text-white',
  info: 'border-blue-300 bg-blue-700 text-white',
  success: 'border-green-300 bg-green-700 text-white',
  warning: 'border-amber-300 bg-amber-700 text-white',
}

export const Snackbar = ({
  message,
  variant = 'info',
  duration = 6000,
  onClose,
}: SnackbarProps) => {
  useEffect(() => {
    if (duration <= 0) return

    const timeoutId = window.setTimeout(onClose, duration)
    return () => window.clearTimeout(timeoutId)
  }, [duration, onClose])

  const isAssertive = variant === 'error' || variant === 'warning'

  return (
    <div
      className={`fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-lg items-start gap-3 rounded-xl border px-4 py-3 shadow-xl ${variantClasses[variant]}`}
      role={isAssertive ? 'alert' : 'status'}
      aria-live={isAssertive ? 'assertive' : 'polite'}
    >
      <p className="min-w-0 flex-1 text-sm leading-6 font-medium">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="-mr-1 grid size-8 shrink-0 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
        aria-label="通知を閉じる"
      >
        <Icon name="close" size="xSmall" />
      </button>
    </div>
  )
}

export const SnackbarHost = () => {
  const notification = useSnackbarStore((state) => state.notification)
  const hideSnackbar = useSnackbarStore((state) => state.hideSnackbar)

  if (!notification) return null

  return (
    <Snackbar
      key={notification.id}
      message={notification.message}
      variant={notification.variant}
      duration={notification.duration}
      onClose={hideSnackbar}
    />
  )
}

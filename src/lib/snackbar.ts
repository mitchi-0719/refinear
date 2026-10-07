import { toast } from 'sonner'

export type SnackbarVariant = 'info' | 'success' | 'warning' | 'error'

type ShowSnackbarInput = {
  message: string
  variant?: SnackbarVariant
  duration?: number
}

const DEFAULT_DURATION = 3000

export const showSnackbar = ({
  message,
  variant = 'info',
  duration = DEFAULT_DURATION,
}: ShowSnackbarInput) => {
  const options = { duration }

  switch (variant) {
    case 'success':
      return toast.success(message, options)
    case 'warning':
      return toast.warning(message, options)
    case 'error':
      return toast.error(message, options)
    case 'info':
      return toast.info(message, options)
  }
}

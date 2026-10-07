import { create } from 'zustand'

export type SnackbarVariant = 'info' | 'success' | 'warning' | 'error'

export type SnackbarNotification = {
  id: number
  message: string
  variant: SnackbarVariant
  duration: number
}

type ShowSnackbarInput = {
  message: string
  variant?: SnackbarVariant
  duration?: number
}

type SnackbarState = {
  notification: SnackbarNotification | null
  showSnackbar: (input: ShowSnackbarInput) => void
  hideSnackbar: () => void
}

const DEFAULT_DURATION = 6000
let nextNotificationId = 0

export const useSnackbarStore = create<SnackbarState>((set) => ({
  notification: null,
  showSnackbar: ({ message, variant = 'info', duration = DEFAULT_DURATION }) =>
    set({
      notification: {
        id: ++nextNotificationId,
        message,
        variant,
        duration,
      },
    }),
  hideSnackbar: () => set({ notification: null }),
}))

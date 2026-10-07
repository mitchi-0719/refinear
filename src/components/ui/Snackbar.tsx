import { Toaster } from 'sonner'

export const SnackbarHost = () => {
  return (
    <Toaster
      className="refinear-snackbar"
      position="top-right"
      richColors
      closeButton
      visibleToasts={1}
      duration={6000}
      offset={{
        top: 'calc(16px + env(safe-area-inset-top))',
        left: 16,
        right: 16,
      }}
      mobileOffset={{
        top: 'calc(16px + env(safe-area-inset-top))',
        left: 16,
        right: 16,
      }}
      swipeDirections={['right']}
      toastOptions={{ closeButtonAriaLabel: '通知を閉じる' }}
    />
  )
}

import { useEffect, useState } from 'react'

import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { Icon } from './ui/Icon'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type PwaInstallDialogProps = {
  isOpen: boolean
  onClose: () => void
}

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  ('standalone' in navigator && navigator.standalone === true)

export const PwaInstallDialog = ({
  isOpen,
  onClose,
}: PwaInstallDialogProps) => {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(isStandalone)

  useBodyScrollLock(isOpen)

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const handleInstalled = () => {
      setInstallPrompt(null)
      setIsInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      )
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  if (!isOpen) return null

  const requestInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  return (
    <div
      className="fixed inset-0 z-110 grid place-items-center overflow-y-auto overscroll-contain bg-slate-950/40 p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
        className="my-auto w-full max-w-md rounded-3xl bg-white p-6 text-[#071b47] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-blue-600">
              もっと手軽に
            </p>
            <h2 id="pwa-install-title" className="mt-1 text-xl font-bold">
              ホーム画面から、すぐ練習
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100"
            aria-label="閉じる"
          >
            <Icon name="close" size="small" />
          </button>
        </div>

        {isInstalled ? (
          <p className="mt-5 rounded-2xl bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
            Refinearはすでにホーム画面から使える状態です。
          </p>
        ) : (
          <>
            <p className="mt-5 text-sm leading-6 text-slate-600">
              Refinearをホーム画面に追加すると、ブラウザを開かずアプリのように起動できます。
            </p>
            {installPrompt && (
              <button
                type="button"
                onClick={() => void requestInstall()}
                className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white active:bg-blue-700"
              >
                Refinearをホーム画面に追加
              </button>
            )}
            <div className="mt-5 rounded-2xl border border-slate-200 p-4 text-sm leading-6">
              <h3 className="font-bold">ホーム画面への追加方法</h3>
              <ol className="mt-3 space-y-3 text-slate-600">
                <li className="flex items-center gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#071b47] text-xs font-bold text-white">
                    1
                  </span>
                  共有ボタン
                  <Icon name="ios-share" size="small" />
                  をタップ
                </li>
                <li className="flex items-center gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#071b47] text-xs font-bold text-white">
                    2
                  </span>
                  「ホーム画面に追加」を選択
                </li>
              </ol>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl border border-slate-300 px-4 py-3 font-bold active:bg-slate-50"
        >
          閉じる
        </button>
      </section>
    </div>
  )
}

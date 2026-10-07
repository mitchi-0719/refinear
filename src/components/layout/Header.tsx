import { useState } from 'react'

import { featureFlags } from '../../config/featureFlags'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { useScoreStore } from '../../stores/useScoreStore'
import { Icon } from '../ui/Icon'

type HeaderProps = {
  hasScore: boolean
  onOpenInstallGuide: () => void
}

export const Header = ({ hasScore, onOpenInstallGuide }: HeaderProps) => {
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const fileName = useScoreStore((state) => state.fileName)
  const reset = useScoreStore((state) => state.reset)

  useBodyScrollLock(isAboutOpen)

  const returnHome = () => {
    reset()
  }

  return (
    <>
      <header
        className="sticky top-0 right-0 left-0 z-40 border-b border-slate-200 bg-white/95 text-[#071b47] shadow-[0_4px_16px_rgba(15,38,75,0.10)] backdrop-blur"
        data-app-header
      >
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:h-20 sm:px-6">
          {hasScore ? (
            <button
              type="button"
              onClick={returnHome}
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-[#071b47] shadow-sm active:bg-slate-50 sm:size-11"
              aria-label="ホームへ戻る"
            >
              <Icon name="home" />
            </button>
          ) : (
            <div className="flex min-w-0 items-center">
              <img
                src="/banner.png"
                alt="Refinear"
                className="h-8 w-auto max-w-40 object-contain sm:h-11 sm:max-w-48"
              />
            </div>
          )}

          {hasScore ? (
            <p className="mx-3 min-w-0 flex-1 truncate text-center text-sm font-bold sm:text-base">
              {fileName}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setIsAboutOpen(true)}
              className="grid size-10 shrink-0 place-items-center rounded-full text-[#071b47] active:bg-blue-50"
              aria-label="このアプリについて"
            >
              <Icon name="info" size="large" />
            </button>
          )}

          {hasScore && featureFlags.scoreExport && (
            <button
              type="button"
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-[#071b47] shadow-sm active:bg-slate-50 sm:size-11"
              aria-label="楽譜をエクスポート"
            >
              <Icon name="share" />
            </button>
          )}
          {hasScore && !featureFlags.scoreExport && (
            <span className="size-10 shrink-0 sm:size-11" aria-hidden="true" />
          )}
        </div>
      </header>

      {isAboutOpen && (
        <div
          className="fixed inset-0 z-100 grid place-items-center overflow-y-auto overscroll-contain bg-slate-950/35 p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsAboutOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            className="my-auto w-full max-w-md rounded-3xl bg-white p-6 text-[#071b47] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-[0.12em] text-blue-600">
                  ABOUT
                </p>
                <h2 id="about-title" className="mt-1 text-xl font-bold">
                  Refinearについて
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsAboutOpen(false)}
                className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100"
                aria-label="閉じる"
              >
                <Icon name="close" size="small" />
              </button>
            </div>
            <p className="mt-5 text-sm leading-6 text-slate-600">
              Refinearは、「洗練する」を意味する Refine と、「聴く」を意味する
              Hear
              を組み合わせた名前です。楽譜を見て、音を聴き、繰り返し確かめる。その積み重ねで、一つひとつの音や自分のパートを磨いていく音取りの過程を表現しています。
            </p>
            <ul className="mt-5 space-y-1 text-sm leading-6 text-slate-600">
              <li>MSCZ楽譜をブラウザ内で表示・再生できます。</li>
              <li>ファイルは外部へ送信されず、端末内で処理されます。</li>
              <li>
                音符のタップ、テンポ変更、パート別の音量調整に対応しています。
              </li>
            </ul>
            <button
              type="button"
              onClick={() => {
                setIsAboutOpen(false)
                onOpenInstallGuide()
              }}
              className="mt-5 w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 font-bold text-blue-700 active:bg-blue-100"
            >
              ホーム画面への追加方法を見る
            </button>
            <button
              type="button"
              onClick={() => setIsAboutOpen(false)}
              className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-bold text-white active:bg-blue-700"
            >
              閉じる
            </button>
          </section>
        </div>
      )}
    </>
  )
}

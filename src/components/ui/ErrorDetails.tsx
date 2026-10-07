import type { FC } from 'react'

import { appEnvironment } from '../../config/featureFlags'
import { type AppErrorInfo, formatAppErrorDiagnostic } from '../../lib/appError'
import { showSnackbar } from '../../lib/snackbar'

type ErrorDetailsProps = {
  error: AppErrorInfo
}

export const ErrorDetails: FC<ErrorDetailsProps> = ({ error }) => {
  if (!appEnvironment.isDebugEnabled) return null

  const diagnostic = formatAppErrorDiagnostic(error, appEnvironment.deployment)

  const copyDiagnostic = async () => {
    try {
      await navigator.clipboard.writeText(diagnostic)
      showSnackbar({ message: '技術情報をコピーしました', variant: 'success' })
    } catch {
      showSnackbar({
        message: '技術情報をコピーできませんでした',
        variant: 'error',
      })
    }
  }

  return (
    <details
      className="mt-3 rounded-md border border-current/20 bg-white/50 px-3 py-2 text-left"
      data-error-code={error.code}
    >
      <summary className="cursor-pointer text-xs font-semibold">
        技術情報を表示
      </summary>
      <div className="mt-2 space-y-2">
        <pre className="max-h-64 overflow-auto rounded bg-slate-950 p-3 font-mono text-xs break-all whitespace-pre-wrap text-slate-100">
          {diagnostic}
        </pre>
        <button
          type="button"
          className="min-h-11 w-full rounded-md border border-current/30 bg-white px-3 py-2 text-xs font-semibold"
          onClick={() => void copyDiagnostic()}
        >
          技術情報をコピー
        </button>
      </div>
    </details>
  )
}

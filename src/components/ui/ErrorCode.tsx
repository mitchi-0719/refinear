import type { FC } from 'react'

import { appEnvironment } from '../../config/featureFlags'
import type { AppErrorCode } from '../../lib/appError'

type ErrorCodeProps = {
  code: AppErrorCode
}

export const ErrorCode: FC<ErrorCodeProps> = ({ code }) => {
  if (!appEnvironment.isDebugEnabled) return null

  return (
    <div className="mt-2 font-mono text-xs" data-error-code={code}>
      エラーコード: {code}
    </div>
  )
}

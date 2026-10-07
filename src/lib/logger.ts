import { appEnvironment } from '../config/featureFlags'
import type { AppErrorInfo } from './appError'

type LogMethod = (...data: unknown[]) => void
type AppErrorLogMethod = (error: AppErrorInfo, cause?: unknown) => void
type Logger = Record<'debug' | 'log' | 'info' | 'warn' | 'error', LogMethod> & {
  appError: AppErrorLogMethod
}
type ConsoleTarget = Pick<Console, 'debug' | 'log' | 'info' | 'warn' | 'error'>

const noop: LogMethod = () => undefined
const noopAppError: AppErrorLogMethod = () => undefined

export const createLogger = (
  isEnabled: boolean,
  consoleTarget: ConsoleTarget = console
): Logger => ({
  debug: isEnabled ? consoleTarget.debug.bind(consoleTarget) : noop,
  log: isEnabled ? consoleTarget.log.bind(consoleTarget) : noop,
  info: isEnabled ? consoleTarget.info.bind(consoleTarget) : noop,
  warn: isEnabled ? consoleTarget.warn.bind(consoleTarget) : noop,
  error: isEnabled ? consoleTarget.error.bind(consoleTarget) : noop,
  appError: isEnabled
    ? (error, cause) => {
        const logEntry = {
          event: 'app_error',
          code: error.code,
          context: error.context,
          message: error.message,
          details: error.details,
        }

        if (cause === undefined) {
          consoleTarget.error(logEntry)
          return
        }
        consoleTarget.error(logEntry, cause)
      }
    : noopAppError,
})

/**
 * ローカル開発環境とプレビュー環境だけブラウザコンソールへ出力する。
 * 本番デプロイではすべてのメソッドが何もしない。
 */
export const logger = createLogger(appEnvironment.isDebugEnabled)

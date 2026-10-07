import { appEnvironment } from '../config/featureFlags'

type LogMethod = (...data: unknown[]) => void

const noop: LogMethod = () => undefined

/**
 * ローカル開発環境とプレビュー環境だけブラウザコンソールへ出力する。
 * 本番デプロイではすべてのメソッドが何もしない。
 */
export const logger = {
  debug: appEnvironment.isDebugEnabled ? console.debug.bind(console) : noop,
  log: appEnvironment.isDebugEnabled ? console.log.bind(console) : noop,
  info: appEnvironment.isDebugEnabled ? console.info.bind(console) : noop,
  warn: appEnvironment.isDebugEnabled ? console.warn.bind(console) : noop,
  error: appEnvironment.isDebugEnabled ? console.error.bind(console) : noop,
} satisfies Record<'debug' | 'log' | 'info' | 'warn' | 'error', LogMethod>

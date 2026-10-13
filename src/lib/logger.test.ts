import { describe, expect, it, vi } from 'vitest'

import { APP_ERROR_CODES, createAppError } from './appError'
import { createLogger } from './logger'

const createConsoleTarget = () => ({
  debug: vi.fn(),
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

describe('logger', () => {
  it('有効時は元の例外と構造化した情報をconsole.errorへ渡す', () => {
    const consoleTarget = createConsoleTarget()
    const logger = createLogger(true, consoleTarget)
    const cause = new Error('変換エラー')
    cause.stack = 'Error: 変換エラー\n    at convert.mjs:10'
    const error = createAppError(
      APP_ERROR_CODES.scoreConversionFailed,
      '楽譜を読み取れませんでした',
      { context: '楽譜の変換', cause }
    )

    logger.appError(error, cause)

    expect(consoleTarget.error).toHaveBeenCalledWith(
      {
        event: 'app_error',
        code: 'RF-CONVERT-001',
        context: '楽譜の変換',
        message: '楽譜を読み取れませんでした',
        details: 'Error: 変換エラー\n    at convert.mjs:10',
      },
      cause
    )
  })

  it('無効時はアプリエラーをconsoleへ出力しない', () => {
    const consoleTarget = createConsoleTarget()
    const logger = createLogger(false, consoleTarget)
    const error = createAppError(
      APP_ERROR_CODES.scoreRenderFailed,
      '描画に失敗しました',
      { context: '楽譜の描画' }
    )

    logger.appError(error)

    expect(consoleTarget.error).not.toHaveBeenCalled()
  })
})

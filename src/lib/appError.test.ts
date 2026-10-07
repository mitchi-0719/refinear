import { describe, expect, it } from 'vitest'

import {
  APP_ERROR_CODES,
  createAppError,
  formatAppErrorDiagnostic,
  getErrorDetails,
  getErrorMessage,
} from './appError'

describe('appError', () => {
  it('固定コードとメッセージから表示用エラーを作る', () => {
    expect(
      createAppError(
        APP_ERROR_CODES.scoreConversionFailed,
        '変換に失敗しました',
        { context: '楽譜の変換' }
      )
    ).toEqual({
      code: 'RF-CONVERT-001',
      message: '変換に失敗しました',
      context: '楽譜の変換',
      details: '変換に失敗しました',
    })
  })

  it('元の例外のメッセージとstackを技術情報として保持する', () => {
    const cause = new Error('WASMの実行に失敗しました')
    cause.name = 'WasmError'
    cause.stack = 'WasmError: WASMの実行に失敗しました\n    at convert.mjs:10'

    expect(
      createAppError(
        APP_ERROR_CODES.scoreConversionFailed,
        '楽譜を読み取れませんでした',
        { context: '楽譜の変換', cause }
      )
    ).toEqual({
      code: 'RF-CONVERT-001',
      message: '楽譜を読み取れませんでした',
      context: '楽譜の変換',
      details: 'WasmError: WASMの実行に失敗しました\n    at convert.mjs:10',
    })
  })

  it('循環参照やバイナリを展開しすぎずに文字列化する', () => {
    const cause: Record<string, unknown> = {
      status: 500,
      binary: new Uint8Array(1024),
    }
    cause.self = cause

    const details = getErrorDetails(cause)

    expect(details).toContain('"status": 500')
    expect(details).toContain('[Uint8Array byteLength=1024]')
    expect(details).toContain('[Circular]')
  })

  it('モバイルでコピーできる診断テキストを組み立てる', () => {
    const error = createAppError(
      APP_ERROR_CODES.scoreRenderFailed,
      '描画に失敗しました',
      { context: '楽譜の描画', cause: new Error('SVG生成エラー') }
    )

    expect(formatAppErrorDiagnostic(error, 'preview')).toContain(
      [
        'エラーコード: RF-RENDER-001',
        '実行環境: preview',
        '発生箇所: 楽譜の描画',
        '詳細:',
        'Error: SVG生成エラー',
      ].join('\n')
    )
  })

  it('Error のメッセージを保持する', () => {
    expect(getErrorMessage(new Error('詳細'), '代替')).toBe('詳細')
  })

  it('Error 以外では代替メッセージを返す', () => {
    expect(getErrorMessage('詳細', '代替')).toBe('代替')
  })
})

import { describe, expect, it } from 'vitest'

import { APP_ERROR_CODES, createAppError, getErrorMessage } from './appError'

describe('appError', () => {
  it('固定コードとメッセージから表示用エラーを作る', () => {
    expect(
      createAppError(
        APP_ERROR_CODES.scoreConversionFailed,
        '変換に失敗しました'
      )
    ).toEqual({
      code: 'RF-CONVERT-001',
      message: '変換に失敗しました',
    })
  })

  it('Error のメッセージを保持する', () => {
    expect(getErrorMessage(new Error('詳細'), '代替')).toBe('詳細')
  })

  it('Error 以外では代替メッセージを返す', () => {
    expect(getErrorMessage('詳細', '代替')).toBe('代替')
  })
})

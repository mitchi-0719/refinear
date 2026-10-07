import { describe, expect, it } from 'vitest'

import { isOsmdGlissandoLayoutError } from './osmdCompatibility'

describe('isOsmdGlissandoLayoutError', () => {
  it('OSMDのグリッサンド描画で発生する既知の例外を判定する', () => {
    expect(
      isOsmdGlissandoLayoutError(
        new TypeError(
          "Cannot read properties of undefined (reading 'HasEndLine')"
        )
      )
    ).toBe(true)
  })

  it('無関係な描画エラーは回避対象にしない', () => {
    expect(
      isOsmdGlissandoLayoutError(new TypeError('Unknown layout failure'))
    ).toBe(false)
    expect(
      isOsmdGlissandoLayoutError(new Error('HasEndLine is unavailable'))
    ).toBe(false)
    expect(isOsmdGlissandoLayoutError('HasEndLine')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import {
  SCORE_CACHE_VERSION,
  SCORE_CONVERTER_VERSION,
  getCachedScoreCompatibility,
} from './scoreHistory'

describe('getCachedScoreCompatibility', () => {
  it('現行の変換バージョンをcurrentと判定する', () => {
    expect(
      getCachedScoreCompatibility({
        cacheVersion: SCORE_CACHE_VERSION,
        converterVersion: SCORE_CONVERTER_VERSION,
      })
    ).toBe('current')
  })

  it('同じキャッシュ形式の過去の変換バージョンをlegacyと判定する', () => {
    for (const converterVersion of [
      'webmscore-1.2.1',
      'webmscore-1.2.1-swing-1',
    ]) {
      expect(
        getCachedScoreCompatibility({
          cacheVersion: SCORE_CACHE_VERSION,
          converterVersion,
        })
      ).toBe('legacy')
    }
  })

  it('キャッシュ形式が異なる、または変換バージョンが不正ならincompatibleと判定する', () => {
    expect(
      getCachedScoreCompatibility({
        cacheVersion: SCORE_CACHE_VERSION + 1,
        converterVersion: SCORE_CONVERTER_VERSION,
      })
    ).toBe('incompatible')
    expect(
      getCachedScoreCompatibility({
        cacheVersion: SCORE_CACHE_VERSION,
        converterVersion: '',
      })
    ).toBe('incompatible')
    expect(
      getCachedScoreCompatibility({
        cacheVersion: SCORE_CACHE_VERSION,
        converterVersion: null,
      })
    ).toBe('incompatible')
  })
})

import { describe, expect, it } from 'vitest'

import {
  getKeySignatureAlter,
  isAccidentalImpliedByKeySignature,
  isPitchStep,
} from './keySignature'

describe('keySignature', () => {
  it('フラット調の構成音を判定する', () => {
    expect(getKeySignatureAlter(-2, 'B')).toBe(-1)
    expect(getKeySignatureAlter(-2, 'E')).toBe(-1)
    expect(getKeySignatureAlter(-2, 'A')).toBe(0)
  })

  it('シャープ調の構成音を判定する', () => {
    expect(getKeySignatureAlter(3, 'F')).toBe(1)
    expect(getKeySignatureAlter(3, 'C')).toBe(1)
    expect(getKeySignatureAlter(3, 'G')).toBe(1)
    expect(getKeySignatureAlter(3, 'D')).toBe(0)
  })

  it('標準外の五度数を補正対象にしない', () => {
    expect(getKeySignatureAlter(-8, 'B')).toBeNull()
    expect(getKeySignatureAlter(8, 'F')).toBeNull()
    expect(getKeySignatureAlter(1.5, 'F')).toBeNull()
  })

  it('調号が表す臨時記号だけを重複と判定する', () => {
    expect(
      isAccidentalImpliedByKeySignature({
        accidental: 'flat',
        alter: -1,
        fifths: -2,
        step: 'B',
      })
    ).toBe(true)
    expect(
      isAccidentalImpliedByKeySignature({
        accidental: 'natural',
        alter: 0,
        fifths: -2,
        step: 'B',
      })
    ).toBe(false)
    expect(
      isAccidentalImpliedByKeySignature({
        accidental: 'sharp',
        alter: 1,
        fifths: -2,
        step: 'F',
      })
    ).toBe(false)
  })

  it('MusicXMLの音名だけを受け入れる', () => {
    expect(isPitchStep('C')).toBe(true)
    expect(isPitchStep('H')).toBe(false)
    expect(isPitchStep('')).toBe(false)
  })
})

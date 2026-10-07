import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { transformWithOxc } from 'vite'

const sourceUrl = new URL('../src/lib/keySignature.ts', import.meta.url)
const source = await readFile(sourceUrl, 'utf8')
const transformed = await transformWithOxc(source, sourceUrl.pathname)
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`
const { getKeySignatureAlter, isAccidentalImpliedByKeySignature, isPitchStep } =
  await import(moduleUrl)

test('フラット調の構成音を判定する', () => {
  assert.equal(getKeySignatureAlter(-2, 'B'), -1)
  assert.equal(getKeySignatureAlter(-2, 'E'), -1)
  assert.equal(getKeySignatureAlter(-2, 'A'), 0)
})

test('シャープ調の構成音を判定する', () => {
  assert.equal(getKeySignatureAlter(3, 'F'), 1)
  assert.equal(getKeySignatureAlter(3, 'C'), 1)
  assert.equal(getKeySignatureAlter(3, 'G'), 1)
  assert.equal(getKeySignatureAlter(3, 'D'), 0)
})

test('標準外の五度数を補正対象にしない', () => {
  assert.equal(getKeySignatureAlter(-8, 'B'), null)
  assert.equal(getKeySignatureAlter(8, 'F'), null)
  assert.equal(getKeySignatureAlter(1.5, 'F'), null)
})

test('調号が表す臨時記号だけを重複と判定する', () => {
  assert.equal(
    isAccidentalImpliedByKeySignature({
      accidental: 'flat',
      alter: -1,
      fifths: -2,
      step: 'B',
    }),
    true
  )
  assert.equal(
    isAccidentalImpliedByKeySignature({
      accidental: 'natural',
      alter: 0,
      fifths: -2,
      step: 'B',
    }),
    false
  )
  assert.equal(
    isAccidentalImpliedByKeySignature({
      accidental: 'sharp',
      alter: 1,
      fifths: -2,
      step: 'F',
    }),
    false
  )
})

test('MusicXMLの音名だけを受け入れる', () => {
  assert.equal(isPitchStep('C'), true)
  assert.equal(isPitchStep('H'), false)
  assert.equal(isPitchStep(''), false)
})

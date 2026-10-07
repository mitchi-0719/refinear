import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { transformWithOxc } from 'vite'

const sourceUrl = new URL('../src/lib/osmdCompatibility.ts', import.meta.url)
const source = await readFile(sourceUrl, 'utf8')
const transformed = await transformWithOxc(source, sourceUrl.pathname)
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`
const { isOsmdGlissandoLayoutError } = await import(moduleUrl)

test('OSMDのグリッサンド描画で発生する既知の例外を判定する', () => {
  assert.equal(
    isOsmdGlissandoLayoutError(
      new TypeError(
        "Cannot read properties of undefined (reading 'HasEndLine')"
      )
    ),
    true
  )
})

test('無関係な描画エラーは回避対象にしない', () => {
  assert.equal(
    isOsmdGlissandoLayoutError(new TypeError('Unknown layout failure')),
    false
  )
  assert.equal(
    isOsmdGlissandoLayoutError(new Error('HasEndLine is unavailable')),
    false
  )
  assert.equal(isOsmdGlissandoLayoutError('HasEndLine'), false)
})

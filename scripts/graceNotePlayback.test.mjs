import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { transformWithOxc } from 'vite'

const sourceUrl = new URL('../src/lib/graceNotePlayback.ts', import.meta.url)
const source = await readFile(sourceUrl, 'utf8')
const transformed = await transformWithOxc(source, sourceUrl.pathname)
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`
const { applyGraceNotePlaybackTiming } = await import(moduleUrl)

const event = (overrides = {}) => ({
  partId: 'P1',
  voice: '1',
  time: 192,
  duration: 192,
  isGrace: false,
  isRest: false,
  ...overrides,
})

test('装飾音符を直後の通常音の前へ短く並べる', () => {
  const events = [
    event({ isGrace: true, duration: 0 }),
    event({ isGrace: true, duration: 0 }),
    event(),
  ]

  const actual = applyGraceNotePlaybackTiming(events)

  assert.deepEqual(
    actual.map(({ time, duration, isGrace }) => ({
      time,
      duration,
      isGrace,
    })),
    [
      { time: 144, duration: 24, isGrace: true },
      { time: 168, duration: 24, isGrace: true },
      { time: 192, duration: 192, isGrace: false },
    ]
  )
})

test('別声部の装飾音符は対応する通常音だけを基準にする', () => {
  const events = [
    event({ isGrace: true, duration: 0, voice: '1' }),
    event({ voice: '2', duration: 96 }),
    event({ voice: '1', duration: 48 }),
  ]

  const actual = applyGraceNotePlaybackTiming(events)
  const grace = actual.find((candidate) => candidate.isGrace)

  assert.equal(grace?.time, 168)
  assert.equal(grace?.duration, 24)
})

test('直後に通常音がない装飾音符の時刻と音価は変更しない', () => {
  const events = [event({ isGrace: true, duration: 0 })]

  assert.deepEqual(applyGraceNotePlaybackTiming(events), events)
})

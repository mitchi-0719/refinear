import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { transformWithOxc } from 'vite'

const sourceUrl = new URL('../src/lib/swingPlayback.ts', import.meta.url)
const source = await readFile(sourceUrl, 'utf8')
const transformed = await transformWithOxc(source, sourceUrl.pathname)
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`
const { getSwingPlaybackTiming } = await import(moduleUrl)

const baseEvent = {
  partId: 'P1',
  staff: '1',
  time: 0,
  duration: 96,
  nominalDuration: 96,
  measureStartTime: 0,
  noteType: 'eighth',
  isRest: false,
  isGrace: false,
  hasTimeModification: false,
}

test('60%の8分Swingで表拍を延ばし、裏拍を遅らせる', () => {
  const changes = [
    { partId: 'P1', staff: null, time: 0, unit: 'eighth', ratio: 60 },
  ]

  assert.deepEqual(getSwingPlaybackTiming(baseEvent, changes), {
    time: 0,
    duration: 115,
  })
  assert.deepEqual(
    getSwingPlaybackTiming({ ...baseEvent, time: 96 }, changes),
    { time: 115, duration: 77 }
  )
})

test('70%の16分Swingを小節先頭基準で適用する', () => {
  const changes = [
    { partId: 'P1', staff: null, time: 768, unit: '16th', ratio: 70 },
  ]
  const event = {
    ...baseEvent,
    time: 816,
    duration: 48,
    nominalDuration: 48,
    measureStartTime: 768,
    noteType: '16th',
  }

  assert.deepEqual(getSwingPlaybackTiming(event, changes), {
    time: 835,
    duration: 29,
  })
})

test('途中のStraight指定以降はタイミングを変更しない', () => {
  const changes = [
    { partId: 'P1', staff: null, time: 0, unit: 'eighth', ratio: 60 },
    { partId: 'P1', staff: null, time: 768, unit: null, ratio: 50 },
  ]
  const event = { ...baseEvent, time: 864, measureStartTime: 768 }

  assert.deepEqual(getSwingPlaybackTiming(event, changes), {
    time: 864,
    duration: 96,
  })
})

test('タイで延長された音符も開始音の記譜音価を基準に補正する', () => {
  const changes = [
    { partId: 'P1', staff: null, time: 0, unit: 'eighth', ratio: 60 },
  ]
  const tiedEvent = {
    ...baseEvent,
    time: 96,
    duration: 288,
    nominalDuration: 96,
  }

  assert.deepEqual(getSwingPlaybackTiming(tiedEvent, changes), {
    time: 115,
    duration: 269,
  })
})

test('譜表固有の指定は同じ位置のパート全体指定より優先する', () => {
  const changes = [
    { partId: 'P1', staff: null, time: 0, unit: 'eighth', ratio: 60 },
    { partId: 'P1', staff: '2', time: 0, unit: null, ratio: 50 },
  ]

  assert.deepEqual(
    getSwingPlaybackTiming({ ...baseEvent, staff: '2', time: 96 }, changes),
    { time: 96, duration: 96 }
  )
  assert.deepEqual(
    getSwingPlaybackTiming({ ...baseEvent, staff: '1', time: 96 }, changes),
    { time: 115, duration: 77 }
  )
})

test('タプレット、装飾音、指定音価と異なる音符には適用しない', () => {
  const changes = [
    { partId: 'P1', staff: null, time: 0, unit: 'eighth', ratio: 60 },
  ]
  const expected = { time: 96, duration: 96 }

  assert.deepEqual(
    getSwingPlaybackTiming(
      { ...baseEvent, time: 96, hasTimeModification: true },
      changes
    ),
    expected
  )
  assert.deepEqual(
    getSwingPlaybackTiming({ ...baseEvent, time: 96, isGrace: true }, changes),
    expected
  )
  assert.deepEqual(
    getSwingPlaybackTiming(
      { ...baseEvent, time: 96, noteType: 'quarter' },
      changes
    ),
    expected
  )
})

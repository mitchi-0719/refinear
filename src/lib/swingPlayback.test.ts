import { describe, expect, it } from 'vitest'

import type { SwingChange, SwingPlaybackEvent } from './swingPlayback'
import { getSwingPlaybackTiming } from './swingPlayback'

const baseEvent: SwingPlaybackEvent = {
  partId: 'P1',
  staff: '1',
  time: 0,
  duration: 96,
  measureStartTime: 0,
  isRest: false,
  isGrace: false,
  hasTimeModification: false,
}

describe('getSwingPlaybackTiming', () => {
  it('60%の8分Swingで表拍を延ばし、裏拍を遅らせる', () => {
    const changes: SwingChange[] = [
      { partId: 'P1', staff: null, time: 0, unit: 'eighth', ratio: 60 },
    ]

    expect(getSwingPlaybackTiming(baseEvent, changes)).toEqual({
      time: 0,
      duration: 115,
    })
    expect(getSwingPlaybackTiming({ ...baseEvent, time: 96 }, changes)).toEqual(
      { time: 115, duration: 77 }
    )
  })

  it('70%の16分Swingを小節先頭基準で適用する', () => {
    const changes: SwingChange[] = [
      { partId: 'P1', staff: null, time: 768, unit: '16th', ratio: 70 },
    ]
    const event = {
      ...baseEvent,
      time: 816,
      duration: 48,
      measureStartTime: 768,
    }

    expect(getSwingPlaybackTiming(event, changes)).toEqual({
      time: 835,
      duration: 29,
    })
  })

  it('途中のStraight指定以降はタイミングを変更しない', () => {
    const changes: SwingChange[] = [
      { partId: 'P1', staff: null, time: 0, unit: 'eighth', ratio: 60 },
      { partId: 'P1', staff: null, time: 768, unit: null, ratio: 50 },
    ]
    const event = { ...baseEvent, time: 864, measureStartTime: 768 }

    expect(getSwingPlaybackTiming(event, changes)).toEqual({
      time: 864,
      duration: 96,
    })
  })

  it('タイで延長された音符も開始・終了境界を基準に補正する', () => {
    const changes: SwingChange[] = [
      { partId: 'P1', staff: null, time: 0, unit: 'eighth', ratio: 60 },
    ]
    const tiedEvent = {
      ...baseEvent,
      time: 96,
      duration: 288,
    }

    expect(getSwingPlaybackTiming(tiedEvent, changes)).toEqual({
      time: 115,
      duration: 269,
    })
  })

  it('譜表固有の指定は同じ位置のパート全体指定より優先する', () => {
    const changes: SwingChange[] = [
      { partId: 'P1', staff: null, time: 0, unit: 'eighth', ratio: 60 },
      { partId: 'P1', staff: '2', time: 0, unit: null, ratio: 50 },
    ]

    expect(
      getSwingPlaybackTiming({ ...baseEvent, staff: '2', time: 96 }, changes)
    ).toEqual({ time: 96, duration: 96 })
    expect(
      getSwingPlaybackTiming({ ...baseEvent, staff: '1', time: 96 }, changes)
    ).toEqual({ time: 115, duration: 77 })
  })

  it('タプレットと装飾音には適用しない', () => {
    const changes: SwingChange[] = [
      { partId: 'P1', staff: null, time: 0, unit: 'eighth', ratio: 60 },
    ]
    const expected = { time: 96, duration: 96 }

    expect(
      getSwingPlaybackTiming(
        { ...baseEvent, time: 96, hasTimeModification: true },
        changes
      )
    ).toEqual(expected)
    expect(
      getSwingPlaybackTiming({ ...baseEvent, time: 96, isGrace: true }, changes)
    ).toEqual(expected)
  })

  it('16分・8分・16分の全境界を16分Swingで一貫して補正する', () => {
    const changes: SwingChange[] = [
      { partId: 'P1', staff: null, time: 0, unit: '16th', ratio: 70 },
    ]

    expect(
      getSwingPlaybackTiming({ ...baseEvent, time: 0, duration: 48 }, changes)
    ).toEqual({ time: 0, duration: 67 })
    expect(
      getSwingPlaybackTiming({ ...baseEvent, time: 48, duration: 96 }, changes)
    ).toEqual({ time: 67, duration: 96 })
    expect(
      getSwingPlaybackTiming({ ...baseEvent, time: 144, duration: 48 }, changes)
    ).toEqual({ time: 163, duration: 29 })
  })

  it('8分・4分・8分でも音価ではなく境界位置を補正する', () => {
    const changes: SwingChange[] = [
      { partId: 'P1', staff: null, time: 0, unit: 'eighth', ratio: 60 },
    ]

    expect(getSwingPlaybackTiming(baseEvent, changes)).toEqual({
      time: 0,
      duration: 115,
    })
    expect(
      getSwingPlaybackTiming({ ...baseEvent, time: 96, duration: 192 }, changes)
    ).toEqual({ time: 115, duration: 192 })
    expect(
      getSwingPlaybackTiming({ ...baseEvent, time: 288 }, changes)
    ).toEqual({ time: 307, duration: 77 })
  })

  it('Straightの後に再指定されたSwingを再開する', () => {
    const changes: SwingChange[] = [
      { partId: 'P1', staff: null, time: 0, unit: 'eighth', ratio: 60 },
      { partId: 'P1', staff: null, time: 768, unit: null, ratio: 50 },
      { partId: 'P1', staff: null, time: 960, unit: 'eighth', ratio: 60 },
    ]

    expect(
      getSwingPlaybackTiming(
        { ...baseEvent, time: 1056, measureStartTime: 960 },
        changes
      )
    ).toEqual({ time: 1075, duration: 77 })
  })
})

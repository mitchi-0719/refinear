import { describe, expect, it } from 'vitest'

import { applyGraceNotePlaybackTiming } from './graceNotePlayback'
import type { NoteEvent } from './musicXmlParser'

const event = (overrides: Partial<NoteEvent> = {}): NoteEvent => ({
  displayPitch: null,
  dynamic: '',
  glissandoDuration: null,
  glissandoMode: null,
  glissandoTargetMidi: null,
  hasTimeModification: false,
  instrumentName: null,
  isStaccato: false,
  isTieContinuation: false,
  lyric: null,
  measureNumber: 1,
  measureStartTime: 0,
  midi: 60,
  note: 'C4',
  partId: 'P1',
  partName: null,
  playbackKey: 'C4',
  rollSubdivision: null,
  samplerId: 'piano',
  staff: '1',
  velocity: 1,
  voice: '1',
  time: 192,
  duration: 192,
  isGrace: false,
  isRest: false,
  ...overrides,
})

describe('applyGraceNotePlaybackTiming', () => {
  it('装飾音符を直後の通常音の前へ短く並べる', () => {
    const events = [
      event({ isGrace: true, duration: 0 }),
      event({ isGrace: true, duration: 0 }),
      event(),
    ]

    const actual = applyGraceNotePlaybackTiming(events)

    expect(
      actual.map(({ time, duration, isGrace }) => ({
        time,
        duration,
        isGrace,
      }))
    ).toEqual([
      { time: 144, duration: 24, isGrace: true },
      { time: 168, duration: 24, isGrace: true },
      { time: 192, duration: 192, isGrace: false },
    ])
  })

  it('別声部の装飾音符は対応する通常音だけを基準にする', () => {
    const events = [
      event({ isGrace: true, duration: 0, voice: '1' }),
      event({ voice: '2', duration: 96 }),
      event({ voice: '1', duration: 48 }),
    ]

    const actual = applyGraceNotePlaybackTiming(events)
    const grace = actual.find((candidate) => candidate.isGrace)

    expect(grace?.time).toBe(168)
    expect(grace?.duration).toBe(24)
  })

  it('直後に通常音がない装飾音符の時刻と音価は変更しない', () => {
    const events = [event({ isGrace: true, duration: 0 })]

    expect(applyGraceNotePlaybackTiming(events)).toEqual(events)
  })
})

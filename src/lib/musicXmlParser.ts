import {
  DRUM_SAMPLE_KEY_BY_LABEL,
  MIDI_UNPITCHED_TO_KEY,
} from '../constants/drum'
import { applyGraceNotePlaybackTiming } from './graceNotePlayback'
import { logger } from './logger'
import type { SwingChange, SwingUnit } from './swingPlayback'

export type SamplerId = 'piano' | 'drum' | 'clap'

export type TempoChange = {
  time: number
  bpm: number
}

export type NoteEvent = {
  partId: string
  staff: string
  partName: string | null
  instrumentName: string | null
  samplerId: SamplerId
  time: number
  duration: number
  measureStartTime: number
  isGrace: boolean
  hasTimeModification: boolean
  note: string
  playbackKey: string
  midi: number
  velocity: number
  dynamic: string
  lyric: string | null
  voice: string
  measureNumber: number
  isRest: boolean
  isTieContinuation: boolean
  isStaccato: boolean
  rollSubdivision: number | null
  glissandoTargetMidi: number | null
  glissandoDuration: number | null
  glissandoMode: 'discrete' | 'continuous' | null
  displayPitch: string | null
}

type PartMeta = {
  partName: string | null
  instrumentNameById: Map<string, string>
  midiUnpitchedById: Map<string, number>
}

type PendingTie = {
  partId: string
  partName: string | null
  instrumentName: string | null
  samplerId: SamplerId
  voice: string
  note: string
  playbackKey: string
  midi: number
  velocity: number
  dynamic: string
  lyric: string | null
  startTime: number
  duration: number
  measureNumber: number
  startEvent: NoteEvent
  displayPitch: string | null
}

type ParsedNoteData = {
  note: string
  playbackKey: string
  midi: number
  samplerId: SamplerId
  instrumentName: string | null
  displayPitch: string | null
}

const TICKS_PER_QUARTER = 192
const DEFAULT_VELOCITY = 80

const VELOCITY_BY_DYNAMIC: Record<string, number> = {
  pppppp: 1,
  ppppp: 5,
  pppp: 10,
  ppp: 16,
  pp: 33,
  p: 49,
  mp: 64,
  mf: 80,
  f: 96,
  ff: 112,
  fff: 126,
  ffff: 127,
  fffff: 127,
  ffffff: 127,
}

const STEP_TO_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

const SEMITONE_TO_NOTE = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
]

const normalizeLabel = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '')

const CLAP_LABELS = ['clap', 'handclap']
const DRUM_LABELS = [
  'drum',
  'percussion',
  'bassdrum',
  'sidestick',
  'snare',
  'hihat',
  'tom',
  'cymbal',
  'cowbell',
  'tambourine',
  'ridebell',
  'stick',
]

const getTempo = (doc: Document): number => {
  const soundTempo = doc.querySelector('sound[tempo]')
  if (soundTempo) {
    const tempo = Number(soundTempo.getAttribute('tempo'))
    if (!Number.isNaN(tempo) && tempo > 0) return tempo
  }

  const metronome = doc.querySelector('metronome per-minute')
  if (metronome?.textContent) {
    const tempo = Number(metronome.textContent)
    if (!Number.isNaN(tempo) && tempo > 0) return tempo
  }

  return 120
}

const getPartMetaMap = (doc: Document): Map<string, PartMeta> => {
  const partMetaMap = new Map<string, PartMeta>()

  doc.querySelectorAll('part-list > score-part').forEach((scorePart) => {
    const partId = scorePart.getAttribute('id')
    if (!partId) return

    const partName =
      scorePart.querySelector('part-name')?.textContent?.trim() || null
    const instrumentNameById = new Map<string, string>()
    const midiUnpitchedById = new Map<string, number>()

    scorePart
      .querySelectorAll('score-instrument')
      .forEach((scoreInstrument) => {
        const instrumentId = scoreInstrument.getAttribute('id')
        const instrumentName = scoreInstrument
          .querySelector('instrument-name')
          ?.textContent?.trim()

        if (instrumentId && instrumentName) {
          instrumentNameById.set(instrumentId, instrumentName)
        }
      })

    scorePart.querySelectorAll('midi-instrument').forEach((midiInstrument) => {
      const instrumentId = midiInstrument.getAttribute('id')
      // MusicXML の midi-unpitched は 1-indexed (1-128) なので、
      // 標準 MIDI note number (0-127) に変換するために -1 する
      const rawValue = Number(
        midiInstrument.querySelector('midi-unpitched')?.textContent || ''
      )
      const midiUnpitched = rawValue - 1

      if (instrumentId && !Number.isNaN(midiUnpitched) && midiUnpitched >= 0) {
        midiUnpitchedById.set(instrumentId, midiUnpitched)
      }
    })

    partMetaMap.set(partId, {
      partName,
      instrumentNameById,
      midiUnpitchedById,
    })
  })

  return partMetaMap
}

const getInitialDivisions = (doc: Document): number => {
  const divisions = Number(
    doc.querySelector('part measure attributes divisions')?.textContent || '1'
  )

  return Number.isNaN(divisions) || divisions <= 0 ? 1 : divisions
}

const getMeasureDivisions = (measure: Element, fallback: number): number => {
  const text = measure.querySelector('attributes > divisions')?.textContent
  const value = Number(text)

  return !text || Number.isNaN(value) || value <= 0 ? fallback : value
}

const getVoice = (note: Element): string =>
  note.querySelector('voice')?.textContent?.trim() || '1'

const getLyric = (note: Element): string | null => {
  const lyric = note.querySelector('lyric text')?.textContent?.trim()
  return lyric && lyric.length > 0 ? lyric : null
}

const getDurationTicks = (note: Element, divisions: number): number => {
  const duration = Number(note.querySelector('duration')?.textContent || '0')
  if (Number.isNaN(duration) || duration <= 0) return 0

  return Math.round((duration / divisions) * TICKS_PER_QUARTER)
}

const getTempoChanges = (
  doc: Document,
  measureStartTicks: number[],
  fallbackDivisions: number
): TempoChange[] => {
  const firstPart = doc.querySelector('part')
  if (!firstPart) return [{ time: 0, bpm: 120 }]

  const changes = new Map<number, number>()
  let currentDivisions = fallbackDivisions

  firstPart.querySelectorAll(':scope > measure').forEach((measure, index) => {
    currentDivisions = getMeasureDivisions(measure, currentDivisions)
    const measureStart = measureStartTicks[index] ?? 0
    let cursor = measureStart

    Array.from(measure.children).forEach((child) => {
      const tag = child.tagName.toLowerCase()
      if (tag === 'backup' || tag === 'forward') {
        const rawDuration = Number(
          child.querySelector('duration')?.textContent || '0'
        )
        const ticks = Number.isFinite(rawDuration)
          ? Math.round((rawDuration / currentDivisions) * TICKS_PER_QUARTER)
          : 0
        cursor += tag === 'backup' ? -ticks : ticks
        cursor = Math.max(measureStart, cursor)
        return
      }

      if (tag === 'note') {
        if (!child.querySelector('chord')) {
          cursor += getDurationTicks(child, currentDivisions)
        }
        return
      }

      if (tag !== 'direction' && tag !== 'sound') return

      const sound = tag === 'sound' ? child : child.querySelector('sound')
      const rawTempo = sound?.getAttribute('tempo')
      const metronomeTempo = child.querySelector(
        'direction-type > metronome > per-minute'
      )?.textContent
      const bpm = Number(rawTempo || metronomeTempo || '')
      if (!Number.isFinite(bpm) || bpm <= 0) return

      const rawOffset = Number(
        child.querySelector(':scope > offset')?.textContent || '0'
      )
      const offsetTicks = Number.isFinite(rawOffset)
        ? Math.round((rawOffset / currentDivisions) * TICKS_PER_QUARTER)
        : 0
      changes.set(Math.max(0, cursor + offsetTicks), bpm)
    })
  })

  if (!changes.has(0)) changes.set(0, getTempo(doc))
  return Array.from(changes, ([time, bpm]) => ({ time, bpm })).sort(
    (left, right) => left.time - right.time
  )
}

const getSwingChanges = (
  doc: Document,
  measureStartTicks: number[],
  fallbackDivisions: number
): SwingChange[] => {
  const changes: SwingChange[] = []

  doc.querySelectorAll('score-partwise > part').forEach((part) => {
    const partId = part.getAttribute('id') || 'P1'
    let currentDivisions = fallbackDivisions

    part.querySelectorAll(':scope > measure').forEach((measure, index) => {
      currentDivisions = getMeasureDivisions(measure, currentDivisions)
      const measureStart = measureStartTicks[index] ?? 0
      let cursor = measureStart

      Array.from(measure.children).forEach((child) => {
        const tag = child.tagName.toLowerCase()
        if (tag === 'backup' || tag === 'forward') {
          const rawDuration = Number(
            child.querySelector('duration')?.textContent || '0'
          )
          const ticks = Number.isFinite(rawDuration)
            ? Math.round((rawDuration / currentDivisions) * TICKS_PER_QUARTER)
            : 0
          cursor = Math.max(
            measureStart,
            cursor + (tag === 'backup' ? -ticks : ticks)
          )
          return
        }

        if (tag === 'note') {
          if (!child.querySelector('chord')) {
            cursor += getDurationTicks(child, currentDivisions)
          }
          return
        }

        if (tag !== 'direction') return
        const swing = child.querySelector(':scope > sound > swing')
        if (!swing) return

        const soundOffset =
          swing.parentElement?.querySelector(':scope > offset')?.textContent
        const directionOffset =
          child.querySelector(':scope > offset')?.textContent
        const rawOffset = Number(soundOffset ?? directionOffset ?? '0')
        const offsetTicks = Number.isFinite(rawOffset)
          ? Math.round((rawOffset / currentDivisions) * TICKS_PER_QUARTER)
          : 0
        const time = Math.max(0, cursor + offsetTicks)
        const staff =
          child.querySelector(':scope > staff')?.textContent?.trim() || null

        if (swing.querySelector(':scope > straight')) {
          changes.push({ partId, staff, time, unit: null, ratio: 50 })
          return
        }

        const first = Number(
          swing.querySelector(':scope > first')?.textContent || ''
        )
        const second = Number(
          swing.querySelector(':scope > second')?.textContent || ''
        )
        const rawUnit =
          swing.querySelector(':scope > swing-type')?.textContent?.trim() ||
          'eighth'
        const unit: SwingUnit | null =
          rawUnit === 'eighth' || rawUnit === '16th' ? rawUnit : null
        if (
          !unit ||
          !Number.isFinite(first) ||
          !Number.isFinite(second) ||
          first <= 0 ||
          second <= 0
        ) {
          logger.warn('MusicXMLのSwing設定を解釈できませんでした', {
            partId,
            first,
            second,
            unit: rawUnit,
          })
          return
        }

        changes.push({
          partId,
          staff,
          time,
          unit,
          ratio: (first / (first + second)) * 100,
        })
      })
    })
  })

  return changes.sort(
    (left, right) =>
      left.time - right.time ||
      left.partId.localeCompare(right.partId) ||
      Number(left.staff !== null) - Number(right.staff !== null)
  )
}

type DynamicChange = {
  time: number
  velocity: number
  name: string
}

type DynamicWedge = {
  startTime: number
  endTime: number
  type: 'crescendo' | 'diminuendo'
}

type DynamicProfile = {
  changes: DynamicChange[]
  wedges: DynamicWedge[]
}

const getDynamicChangesByStaff = (
  part: Element,
  measureStartTicks: number[],
  fallbackDivisions: number
): Map<string, DynamicProfile> => {
  const profilesByStaff = new Map<string, DynamicProfile>()
  const openWedges = new Map<
    string,
    { startTime: number; type: DynamicWedge['type']; staff: string }
  >()
  let currentDivisions = fallbackDivisions

  const getProfile = (staff: string) => {
    const profile = profilesByStaff.get(staff) ?? { changes: [], wedges: [] }
    profilesByStaff.set(staff, profile)
    return profile
  }

  part.querySelectorAll(':scope > measure').forEach((measure, index) => {
    currentDivisions = getMeasureDivisions(measure, currentDivisions)
    const measureStart = measureStartTicks[index] ?? 0
    let cursor = measureStart

    Array.from(measure.children).forEach((child) => {
      const tag = child.tagName.toLowerCase()
      if (tag === 'backup' || tag === 'forward') {
        const rawDuration = Number(
          child.querySelector('duration')?.textContent || '0'
        )
        const ticks = Number.isFinite(rawDuration)
          ? Math.round((rawDuration / currentDivisions) * TICKS_PER_QUARTER)
          : 0
        cursor = Math.max(
          measureStart,
          cursor + (tag === 'backup' ? -ticks : ticks)
        )
        return
      }

      if (tag === 'note') {
        if (!child.querySelector('chord')) {
          cursor += getDurationTicks(child, currentDivisions)
        }
        return
      }

      if (tag !== 'direction') return
      const staff = child.querySelector(':scope > staff')?.textContent || '1'
      const rawOffset = Number(
        child.querySelector(':scope > offset')?.textContent || '0'
      )
      const offsetTicks = Number.isFinite(rawOffset)
        ? Math.round((rawOffset / currentDivisions) * TICKS_PER_QUARTER)
        : 0
      const directionTime = Math.max(0, cursor + offsetTicks)

      const wedge = child.querySelector('direction-type > wedge')
      const wedgeType = wedge?.getAttribute('type')
      const wedgeNumber = wedge?.getAttribute('number') || '1'
      const wedgeKey = `${staff}:${wedgeNumber}`
      if (wedgeType === 'crescendo' || wedgeType === 'diminuendo') {
        openWedges.set(wedgeKey, {
          startTime: directionTime,
          type: wedgeType,
          staff,
        })
      } else if (wedgeType === 'stop') {
        const openWedge = openWedges.get(wedgeKey)
        if (openWedge && directionTime > openWedge.startTime) {
          getProfile(openWedge.staff).wedges.push({
            startTime: openWedge.startTime,
            endTime: directionTime,
            type: openWedge.type,
          })
        }
        openWedges.delete(wedgeKey)
      }

      const dynamics = child.querySelector('direction-type > dynamics')
      const dynamicName = dynamics?.firstElementChild?.tagName.toLowerCase()
      const soundDynamics = Number(
        child.querySelector('sound')?.getAttribute('dynamics') || ''
      )
      const velocity =
        Number.isFinite(soundDynamics) && soundDynamics > 0
          ? Math.round(soundDynamics * 0.9)
          : dynamicName
            ? VELOCITY_BY_DYNAMIC[dynamicName]
            : undefined
      if (velocity === undefined) return

      getProfile(staff).changes.push({
        time: directionTime,
        velocity: Math.min(127, Math.max(1, velocity)),
        name: dynamicName || `velocity ${velocity}`,
      })
    })
  })

  profilesByStaff.forEach((profile) => {
    profile.changes.sort((left, right) => left.time - right.time)
    profile.wedges.sort((left, right) => left.startTime - right.startTime)
  })
  return profilesByStaff
}

const getDynamicAtTime = (
  profile: DynamicProfile | undefined,
  time: number
): { velocity: number; dynamic: string } => {
  const changes = profile?.changes ?? []
  const current = changes.reduce<DynamicChange>(
    (change, candidate) => (candidate.time <= time ? candidate : change),
    { time: 0, velocity: DEFAULT_VELOCITY, name: 'mf (default)' }
  )
  const wedge = profile?.wedges.find(
    (candidate) => candidate.startTime <= time && time < candidate.endTime
  )
  if (!wedge) return { velocity: current.velocity, dynamic: current.name }

  const start = changes.reduce<DynamicChange>(
    (change, candidate) =>
      candidate.time <= wedge.startTime ? candidate : change,
    { time: 0, velocity: DEFAULT_VELOCITY, name: 'mf (default)' }
  )
  const endChange = changes.find(
    (change) => change.time >= wedge.endTime && change.time <= wedge.endTime + 1
  )
  const direction = wedge.type === 'crescendo' ? 1 : -1
  const endVelocity = endChange?.velocity ?? start.velocity + direction * 16
  const progress = (time - wedge.startTime) / (wedge.endTime - wedge.startTime)
  const velocity = Math.min(
    127,
    Math.max(
      1,
      Math.round(start.velocity + (endVelocity - start.velocity) * progress)
    )
  )
  const wedgeName = wedge.type === 'crescendo' ? 'cresc.' : 'dim.'
  return {
    velocity,
    dynamic: `${wedgeName} ${start.name} → ${endChange?.name ?? `±16`}`,
  }
}

const hasTieStart = (note: Element): boolean =>
  note.querySelector(
    ':scope > tie[type="start"], :scope > notations > tied[type="start"]'
  ) !== null

const hasTieStop = (note: Element): boolean =>
  note.querySelector(
    ':scope > tie[type="stop"], :scope > notations > tied[type="stop"]'
  ) !== null

const hasStaccato = (note: Element): boolean =>
  note.querySelector(':scope > notations > articulations > staccato') !== null

const getRollSubdivision = (note: Element): number | null => {
  const tremolo = note.querySelector(':scope > notations > ornaments > tremolo')
  if (!tremolo) return null

  // start/stop は2音間トレモロ。ここではドラムロールとして書き出される
  // single（または type 省略）のみを、刻み幅へ変換する。
  const type = tremolo.getAttribute('type')
  if (type && type !== 'single' && type !== 'unmeasured') return null

  const marks = Number(tremolo.textContent?.trim())
  if (!Number.isInteger(marks) || marks < 1 || marks > 8) return null

  return TICKS_PER_QUARTER / 2 ** marks
}

type GlissandoMarker = {
  key: string
  type: 'start' | 'stop'
  mode: 'discrete' | 'continuous'
}

const getGlissandoMarkers = (note: Element, voice: string): GlissandoMarker[] =>
  Array.from(
    note.querySelectorAll(
      ':scope > notations > glissando, :scope > notations > slide'
    )
  ).flatMap((marker) => {
    const type = marker.getAttribute('type')
    if (type !== 'start' && type !== 'stop') return []

    const number = marker.getAttribute('number') || '1'
    return [
      {
        key: `${voice}:${marker.tagName}:${number}`,
        type,
        mode: marker.tagName === 'slide' ? 'continuous' : 'discrete',
      },
    ]
  })

const getInstrumentId = (note: Element): string | null =>
  note.querySelector('instrument')?.getAttribute('id') || null

const isClapLabel = (label: string | null): boolean => {
  if (!label) return false
  const normalized = normalizeLabel(label)
  return CLAP_LABELS.some((candidate) => normalized.includes(candidate))
}

const isDrumLabel = (label: string | null): boolean => {
  if (!label) return false
  const normalized = normalizeLabel(label)
  return DRUM_LABELS.some((candidate) => normalized.includes(candidate))
}

const resolveSamplerId = (
  partMeta: PartMeta,
  instrumentName: string | null
): SamplerId => {
  const labels = [
    partMeta.partName,
    instrumentName,
    ...partMeta.instrumentNameById.values(),
  ]

  if (labels.some(isClapLabel)) return 'clap'
  if (labels.some(isDrumLabel)) return 'drum'

  return 'piano'
}

const resolvePercussionPlaybackKey = (
  instrumentName: string | null,
  samplerId: SamplerId,
  midi: number
): string => {
  if (samplerId === 'clap') return 'C4'

  if (midi && MIDI_UNPITCHED_TO_KEY[midi]) return MIDI_UNPITCHED_TO_KEY[midi]

  const normalized = normalizeLabel(instrumentName || '')
  return DRUM_SAMPLE_KEY_BY_LABEL[normalized] || 'C1'
}

const parsePitchNote = (note: Element): ParsedNoteData => {
  const step = note.querySelector('pitch > step')?.textContent?.trim() || 'C'
  const alter = Number(note.querySelector('pitch > alter')?.textContent || '0')
  const octave = Number(
    note.querySelector('pitch > octave')?.textContent || '4'
  )

  const safeAlter = Number.isNaN(alter) ? 0 : alter
  const safeOctave = Number.isNaN(octave) ? 4 : octave
  const semitone = (STEP_TO_SEMITONE[step] ?? 0) + safeAlter
  const octaveShift = Math.floor(semitone / 12)
  const normalizedSemitone = ((semitone % 12) + 12) % 12
  const finalOctave = safeOctave + octaveShift
  const noteName = `${SEMITONE_TO_NOTE[normalizedSemitone]}${finalOctave}`

  return {
    note: noteName,
    playbackKey: noteName,
    midi: (finalOctave + 1) * 12 + normalizedSemitone,
    samplerId: 'piano',
    instrumentName: null,
    displayPitch: noteName,
  }
}

const parseUnpitchedDisplayPitch = (note: Element): string => {
  const step =
    note.querySelector('unpitched > display-step')?.textContent?.trim() || 'C'
  const octave = Number(
    note.querySelector('unpitched > display-octave')?.textContent || '4'
  )
  const alter = Number(
    note.querySelector('unpitched > display-alter')?.textContent || '0'
  )

  const safeAlter = Number.isNaN(alter) ? 0 : alter
  const safeOctave = Number.isNaN(octave) ? 4 : octave
  const semitone = (STEP_TO_SEMITONE[step] ?? 0) + safeAlter
  const octaveShift = Math.floor(semitone / 12)
  const normalizedSemitone = ((semitone % 12) + 12) % 12
  const finalOctave = safeOctave + octaveShift
  return `${SEMITONE_TO_NOTE[normalizedSemitone]}${finalOctave}`
}

const parseUnpitchedNote = (
  note: Element,
  partMeta: PartMeta,
  instrumentName: string | null,
  samplerId: SamplerId,
  instrumentId: string | null
): ParsedNoteData => {
  const noteLabel = instrumentName || partMeta.partName || 'Percussion'
  const midi = instrumentId
    ? (partMeta.midiUnpitchedById.get(instrumentId) ?? 0)
    : 0

  return {
    note: noteLabel,
    playbackKey: resolvePercussionPlaybackKey(instrumentName, samplerId, midi),
    midi,
    samplerId,
    instrumentName: instrumentName || noteLabel,
    displayPitch: parseUnpitchedDisplayPitch(note),
  }
}

const parseNoteData = (
  note: Element,
  partMeta: PartMeta,
  partId: string
): ParsedNoteData | null => {
  const instrumentId = getInstrumentId(note)
  const instrumentName = instrumentId
    ? partMeta.instrumentNameById.get(instrumentId) || null
    : null
  const samplerId = resolveSamplerId(partMeta, instrumentName)

  if (note.querySelector('unpitched')) {
    return parseUnpitchedNote(
      note,
      partMeta,
      instrumentName,
      samplerId,
      instrumentId
    )
  }

  if (note.querySelector('pitch')) {
    return parsePitchNote(note)
  }

  if (instrumentName || partMeta.partName) {
    return {
      note: instrumentName || partMeta.partName || partId,
      playbackKey: samplerId === 'clap' ? 'C4' : 'C1',
      midi: 0,
      samplerId,
      instrumentName: instrumentName || partMeta.partName,
      displayPitch: samplerId === 'clap' ? 'C4' : 'C1',
    }
  }

  return null
}

export const parseMusicXmlForEvents = async (
  musicXml: string
): Promise<{
  events: NoteEvent[]
  tempoChanges: TempoChange[]
  swingChanges: SwingChange[]
}> => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(musicXml, 'application/xml')

  if (doc.querySelector('parsererror')) {
    logger.warn('MusicXML の解析に失敗しました')
    return { events: [], tempoChanges: [], swingChanges: [] }
  }

  const events: NoteEvent[] = []
  const fallbackDivisions = getInitialDivisions(doc)
  const partMetaMap = getPartMetaMap(doc)

  // 各小節の絶対開始ティック数を事前に算出する
  const measureStartTicks: number[] = []
  const firstPart = doc.querySelector('part')
  if (firstPart) {
    let currentBeats = 4
    let currentBeatType = 4
    let accumulatedTicks = 0

    firstPart.querySelectorAll('measure').forEach((measure, measureIndex) => {
      const timeElem = measure.querySelector('attributes > time')
      if (timeElem) {
        const beatsVal = Number(timeElem.querySelector('beats')?.textContent)
        const beatTypeVal = Number(
          timeElem.querySelector('beat-type')?.textContent
        )
        if (!Number.isNaN(beatsVal) && beatsVal > 0) {
          currentBeats = beatsVal
        }
        if (!Number.isNaN(beatTypeVal) && beatTypeVal > 0) {
          currentBeatType = beatTypeVal
        }
      }

      measureStartTicks[measureIndex] = accumulatedTicks

      let measureLengthTicks = Math.round(
        ((currentBeats * 4) / currentBeatType) * TICKS_PER_QUARTER
      )

      // 最初の小節がアウフタクト（不完全小節）であるかどうかのチェック
      if (measureIndex === 0) {
        let maxFirstMeasureTicks = 0
        doc.querySelectorAll('part').forEach((p) => {
          const firstMeas = p.querySelector('measure')
          if (firstMeas) {
            const divText = firstMeas.querySelector(
              'attributes > divisions'
            )?.textContent
            const div = divText ? Number(divText) : fallbackDivisions
            const safeDiv =
              !div || Number.isNaN(div) || div <= 0 ? fallbackDivisions : div

            const vTicks = new Map<string, number>()
            let cursor = 0
            Array.from(firstMeas.children).forEach((child) => {
              const tag = child.tagName.toLowerCase()
              if (tag === 'backup') {
                const backDur = Number(
                  child.querySelector('duration')?.textContent || '0'
                )
                const backTicks = Number.isNaN(backDur)
                  ? 0
                  : Math.round((backDur / safeDiv) * TICKS_PER_QUARTER)
                cursor = Math.max(0, cursor - backTicks)
              } else if (tag === 'forward') {
                const fwdDur = Number(
                  child.querySelector('duration')?.textContent || '0'
                )
                const fwdTicks = Number.isNaN(fwdDur)
                  ? 0
                  : Math.round((fwdDur / safeDiv) * TICKS_PER_QUARTER)
                cursor += fwdTicks
              } else if (tag === 'note') {
                const voice = getVoice(child)
                const duration = getDurationTicks(child, safeDiv)
                const isChord = child.querySelector('chord') !== null
                const startTime = isChord ? (vTicks.get(voice) ?? 0) : cursor
                const endTime = startTime + duration
                if (!isChord) {
                  vTicks.set(voice, endTime)
                  cursor = endTime
                }
              }
            })
            const firstPartMax = Array.from(vTicks.values()).reduce(
              (a, b) => Math.max(a, b),
              0
            )
            if (firstPartMax > maxFirstMeasureTicks) {
              maxFirstMeasureTicks = firstPartMax
            }
          }
        })

        if (
          maxFirstMeasureTicks > 0 &&
          maxFirstMeasureTicks < measureLengthTicks
        ) {
          measureLengthTicks = maxFirstMeasureTicks
        }
      }

      accumulatedTicks += measureLengthTicks
    })
  }

  doc.querySelectorAll('part').forEach((part) => {
    const partId = part.getAttribute('id') || 'P1'
    const partMeta = partMetaMap.get(partId) || {
      partName: null,
      instrumentNameById: new Map<string, string>(),
      midiUnpitchedById: new Map<string, number>(),
    }
    const voiceTicks = new Map<string, number>()
    const pendingTies = new Map<string, PendingTie>()
    const pendingGlissandos = new Map<string, NoteEvent>()
    const dynamicChangesByStaff = getDynamicChangesByStaff(
      part,
      measureStartTicks,
      fallbackDivisions
    )
    let currentDivisions = fallbackDivisions

    part.querySelectorAll('measure').forEach((measure, measureIndex) => {
      currentDivisions = getMeasureDivisions(measure, currentDivisions)

      const startTicks = measureStartTicks[measureIndex] ?? 0
      let measureCursor = startTicks

      // measureChildren の処理
      Array.from(measure.children).forEach((child) => {
        const tag = child.tagName.toLowerCase()

        if (tag === 'backup') {
          const backDur = Number(
            child.querySelector('duration')?.textContent || '0'
          )
          const backTicks = Number.isNaN(backDur)
            ? 0
            : Math.round((backDur / currentDivisions) * TICKS_PER_QUARTER)
          measureCursor = Math.max(startTicks, measureCursor - backTicks)
          return
        }

        if (tag === 'forward') {
          const fwdDur = Number(
            child.querySelector('duration')?.textContent || '0'
          )
          const fwdTicks = Number.isNaN(fwdDur)
            ? 0
            : Math.round((fwdDur / currentDivisions) * TICKS_PER_QUARTER)
          measureCursor += fwdTicks
          return
        }

        if (tag !== 'note') return

        const note = child as Element
        const voice = getVoice(note)
        const duration = getDurationTicks(note, currentDivisions)
        const isChord = note.querySelector('chord') !== null
        const isRest = note.querySelector('rest') !== null
        const isStaccato = hasStaccato(note)
        const rollSubdivision = getRollSubdivision(note)

        const currentTime = voiceTicks.get(voice) ?? startTicks
        const baseTime = Math.max(currentTime, startTicks)
        const startTime = isChord ? baseTime : measureCursor
        const staff = note.querySelector(':scope > staff')?.textContent || '1'
        const notePlaybackMetadata = {
          staff,
          measureStartTime: startTicks,
          isGrace: note.querySelector(':scope > grace') !== null,
          hasTimeModification:
            note.querySelector(':scope > time-modification') !== null,
        }
        const { velocity, dynamic } = getDynamicAtTime(
          dynamicChangesByStaff.get(staff),
          startTime
        )

        const rawNum = measure.getAttribute('number')
        const measureNumber = rawNum ? parseInt(rawNum, 10) : measureIndex + 1

        if (isRest) {
          events.push({
            partId,
            ...notePlaybackMetadata,
            partName: partMeta.partName,
            instrumentName: null,
            samplerId: 'piano',
            time: startTime,
            duration,
            note: 'rest',
            playbackKey: '',
            midi: 0,
            velocity,
            dynamic,
            lyric: null,
            voice,
            measureNumber,
            isRest: true,
            isTieContinuation: false,
            isStaccato: false,
            rollSubdivision: null,
            glissandoTargetMidi: null,
            glissandoDuration: null,
            glissandoMode: null,
            displayPitch: null,
          })
          if (!isChord) {
            voiceTicks.set(voice, startTime + duration)
            measureCursor = startTime + duration
          }
          return
        }

        const parsedNote = parseNoteData(note, partMeta, partId)
        if (!parsedNote) {
          if (!isChord) {
            voiceTicks.set(voice, startTime + duration)
            measureCursor = startTime + duration
          }
          return
        }

        const lyric = getLyric(note)
        const registerGlissando = (event: NoteEvent) => {
          getGlissandoMarkers(note, voice).forEach((marker) => {
            if (marker.type === 'start') {
              event.glissandoMode = marker.mode
              pendingGlissandos.set(marker.key, event)
              return
            }

            const startEvent = pendingGlissandos.get(marker.key)
            if (startEvent && startTime > startEvent.time) {
              startEvent.glissandoTargetMidi = event.midi
              startEvent.glissandoDuration = startTime - startEvent.time
            }
            pendingGlissandos.delete(marker.key)
          })
        }
        const tieKey = `${voice}:${parsedNote.playbackKey}`
        const tieStart = hasTieStart(note)
        const tieStop = hasTieStop(note)
        const pendingTie = pendingTies.get(tieKey)

        if (tieStop && pendingTie) {
          pendingTie.duration += duration
          pendingTie.lyric = pendingTie.lyric ?? lyric

          events.push({
            partId: pendingTie.partId,
            ...notePlaybackMetadata,
            partName: pendingTie.partName,
            instrumentName: pendingTie.instrumentName,
            samplerId: pendingTie.samplerId,
            time: startTime,
            duration,
            note: pendingTie.note,
            playbackKey: pendingTie.playbackKey,
            midi: pendingTie.midi,
            velocity: pendingTie.startEvent.velocity,
            dynamic: pendingTie.startEvent.dynamic,
            lyric: pendingTie.lyric,
            voice: pendingTie.voice,
            measureNumber,
            isRest: false,
            isTieContinuation: true,
            isStaccato,
            rollSubdivision,
            glissandoTargetMidi: null,
            glissandoDuration: null,
            glissandoMode: null,
            displayPitch: pendingTie.displayPitch,
          })

          registerGlissando(events[events.length - 1])

          if (!tieStart) {
            pendingTie.startEvent.duration = pendingTie.duration
            pendingTie.startEvent.lyric =
              pendingTie.startEvent.lyric ?? pendingTie.lyric
            pendingTies.delete(tieKey)
          }

          if (!isChord) {
            voiceTicks.set(voice, startTime + duration)
            measureCursor = startTime + duration
          }
          return
        }

        if (tieStart && !tieStop) {
          const event: NoteEvent = {
            partId,
            ...notePlaybackMetadata,
            partName: partMeta.partName,
            instrumentName: parsedNote.instrumentName,
            samplerId: parsedNote.samplerId,
            time: startTime,
            duration,
            note: parsedNote.note,
            playbackKey: parsedNote.playbackKey,
            midi: parsedNote.midi,
            velocity,
            dynamic,
            lyric,
            voice,
            measureNumber,
            isRest: false,
            isTieContinuation: false,
            isStaccato,
            rollSubdivision,
            glissandoTargetMidi: null,
            glissandoDuration: null,
            glissandoMode: null,
            displayPitch: parsedNote.displayPitch,
          }
          events.push(event)
          registerGlissando(event)

          pendingTies.set(tieKey, {
            partId,
            partName: partMeta.partName,
            instrumentName: parsedNote.instrumentName,
            samplerId: parsedNote.samplerId,
            voice,
            note: parsedNote.note,
            playbackKey: parsedNote.playbackKey,
            midi: parsedNote.midi,
            velocity,
            dynamic,
            lyric,
            startTime,
            duration,
            measureNumber: measureIndex + 1,
            startEvent: event,
            displayPitch: parsedNote.displayPitch,
          })

          if (!isChord) {
            voiceTicks.set(voice, startTime + duration)
            measureCursor = startTime + duration
          }
          return
        }

        if (tieStart && tieStop) {
          const event: NoteEvent = {
            partId,
            ...notePlaybackMetadata,
            partName: partMeta.partName,
            instrumentName: parsedNote.instrumentName,
            samplerId: parsedNote.samplerId,
            time: startTime,
            duration,
            note: parsedNote.note,
            playbackKey: parsedNote.playbackKey,
            midi: parsedNote.midi,
            velocity,
            dynamic,
            lyric,
            voice,
            measureNumber,
            isRest: false,
            isTieContinuation: false,
            isStaccato,
            rollSubdivision,
            glissandoTargetMidi: null,
            glissandoDuration: null,
            glissandoMode: null,
            displayPitch: parsedNote.displayPitch,
          }
          events.push(event)
          registerGlissando(event)

          pendingTies.set(tieKey, {
            partId,
            partName: partMeta.partName,
            instrumentName: parsedNote.instrumentName,
            samplerId: parsedNote.samplerId,
            voice,
            note: parsedNote.note,
            playbackKey: parsedNote.playbackKey,
            midi: parsedNote.midi,
            velocity,
            dynamic,
            lyric,
            startTime,
            duration,
            measureNumber: measureIndex + 1,
            startEvent: event,
            displayPitch: parsedNote.displayPitch,
          })

          if (!isChord) {
            voiceTicks.set(voice, startTime + duration)
            measureCursor = startTime + duration
          }
          return
        }

        events.push({
          partId,
          ...notePlaybackMetadata,
          partName: partMeta.partName,
          instrumentName: parsedNote.instrumentName,
          samplerId: parsedNote.samplerId,
          time: startTime,
          duration,
          note: parsedNote.note,
          playbackKey: parsedNote.playbackKey,
          midi: parsedNote.midi,
          velocity,
          dynamic,
          lyric,
          voice,
          measureNumber,
          isRest: false,
          isTieContinuation: false,
          isStaccato,
          rollSubdivision,
          glissandoTargetMidi: null,
          glissandoDuration: null,
          glissandoMode: null,
          displayPitch: parsedNote.displayPitch,
        })
        registerGlissando(events[events.length - 1])

        if (!isChord) {
          voiceTicks.set(voice, startTime + duration)
          measureCursor = startTime + duration
        }
      })
    })

    pendingTies.forEach((pendingTie) => {
      pendingTie.startEvent.duration = pendingTie.duration
      pendingTie.startEvent.lyric =
        pendingTie.startEvent.lyric ?? pendingTie.lyric
    })
  })

  const sortedEvents = applyGraceNotePlaybackTiming(events).sort(
    (left, right) =>
      left.time - right.time ||
      left.partId.localeCompare(right.partId) ||
      left.voice.localeCompare(right.voice)
  )

  return {
    events: sortedEvents,
    tempoChanges: getTempoChanges(doc, measureStartTicks, fallbackDivisions),
    swingChanges: getSwingChanges(doc, measureStartTicks, fallbackDivisions),
  }
}

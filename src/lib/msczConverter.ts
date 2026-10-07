import { isAccidentalImpliedByKeySignature, isPitchStep } from './keySignature'
import { logger } from './logger'

interface MusicScoreExport {
  musicXml: string
  musicMxl: Uint8Array | null
}

type MusicXmlPitch = {
  step: string
  alter: number
}

type MscxHarmony = {
  root: MusicXmlPitch | null
  bass: MusicXmlPitch | null
  name: string
}

type ChordKind = {
  kind: string
  text?: string
}

type RestorePlaybackMetadataResult = {
  musicXml: string
}

type MscxChordPlayback = {
  tremoloMarks: number | null
}

type MscxSwingUnit = 'eighth' | '16th' | null

type MscxSwingMarker = {
  measureIndex: number
  offsetInWholeNotes: number
  unit: MscxSwingUnit
  ratio: number
  partIndex: number | null
  staffNumber: number | null
}

type MscxKeySignature = {
  measureIndex: number
  fifths: number
}

type MscxStaffNotation = {
  partIndex: number
  staffNumber: number
  keySignatures: MscxKeySignature[]
  explicitAccidentalsByMeasure: boolean[][]
}

type MscxPlaybackData = {
  harmonies: MscxHarmony[]
  chordPlayback: MscxChordPlayback[]
  swingMarkers: MscxSwingMarker[]
  staffNotations: MscxStaffNotation[]
}

const HARMONY_TAG_PATTERN = /<harmony\b[\s\S]*?<\/harmony>/g
const DIRECTION_TAG_PATTERN = /<direction\b[\s\S]*?<\/direction>/g
const DIRECTION_TYPE_TAG_PATTERN = /<direction-type\b[\s\S]*?<\/direction-type>/
const NOTE_TAG_PATTERN = /<note\b[\s\S]*?<\/note>/g

const assertPlayableMusicXml = (musicXml: string): void => {
  const doc = new DOMParser().parseFromString(musicXml, 'application/xml')
  const hasParserError = Boolean(doc.querySelector('parsererror'))
  const scoreParts = doc.querySelectorAll('part-list > score-part').length
  const parts = doc.querySelectorAll('score-partwise > part').length
  const measures = doc.querySelectorAll(
    'score-partwise > part > measure'
  ).length

  if (hasParserError || scoreParts === 0 || parts === 0 || measures === 0) {
    throw new Error(
      'MSCZ を MusicXML に変換できませんでした。MuseScore でファイルを開き、最新版の MSCZ として保存し直してください。'
    )
  }
}

const STEP_BY_INDEX = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const NATURAL_TPC_BY_STEP: Record<string, number> = {
  C: 14,
  D: 16,
  E: 18,
  F: 13,
  G: 15,
  A: 17,
  B: 19,
}

const CHORD_KIND_BY_NAME: Record<string, ChordKind> = {
  '': { kind: 'major' },
  m: { kind: 'minor', text: 'm' },
  min: { kind: 'minor', text: 'm' },
  minor: { kind: 'minor', text: 'm' },
  '+': { kind: 'augmented', text: 'aug' },
  aug: { kind: 'augmented', text: 'aug' },
  dim: { kind: 'diminished', text: 'dim' },
  o: { kind: 'diminished', text: 'dim' },
  '7': { kind: 'dominant', text: '7' },
  '/7': { kind: 'dominant', text: '7' },
  maj7: { kind: 'major-seventh', text: 'maj7' },
  M7: { kind: 'major-seventh', text: 'maj7' },
  m7: { kind: 'minor-seventh', text: 'm7' },
  dim7: { kind: 'diminished-seventh', text: 'dim7' },
  aug7: { kind: 'augmented-seventh', text: 'aug7' },
  m7b5: { kind: 'half-diminished', text: 'm7b5' },
  'm7-5': { kind: 'half-diminished', text: 'm7-5' },
  ø: { kind: 'half-diminished', text: 'm7b5' },
  'm(maj7)': { kind: 'major-minor', text: 'm(maj7)' },
  '6': { kind: 'major-sixth', text: '6' },
  maj6: { kind: 'major-sixth', text: 'maj6' },
  m6: { kind: 'minor-sixth', text: 'm6' },
  '9': { kind: 'dominant-ninth', text: '9' },
  maj9: { kind: 'major-ninth', text: 'maj9' },
  m9: { kind: 'minor-ninth', text: 'm9' },
  '11': { kind: 'dominant-11th', text: '11' },
  maj11: { kind: 'major-11th', text: 'maj11' },
  m11: { kind: 'minor-11th', text: 'm11' },
  '13': { kind: 'dominant-13th', text: '13' },
  maj13: { kind: 'major-13th', text: 'maj13' },
  m13: { kind: 'minor-13th', text: 'm13' },
  sus2: { kind: 'suspended-second', text: '2' },
  sus4: { kind: 'suspended-fourth', text: '4' },
  '5': { kind: 'power', text: '5' },
}

const modulo = (value: number, divisor: number) =>
  ((value % divisor) + divisor) % divisor

const getDirectChild = (element: Element, tagName: string): Element | null => {
  return (
    Array.from(element.children).find((child) => child.tagName === tagName) ??
    null
  )
}

const getDirectChildText = (element: Element, tagName: string): string => {
  return getDirectChild(element, tagName)?.textContent?.trim() ?? ''
}

const getDirectChildren = (element: Element, tagName: string): Element[] =>
  Array.from(element.children).filter((child) => child.tagName === tagName)

const escapeXml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

const normalizeTextTempoDirections = (musicXml: string): string =>
  musicXml.replace(DIRECTION_TAG_PATTERN, (direction) => {
    if (
      /<metronome\b/.test(direction) ||
      !/<sound\b[^>]*tempo=/.test(direction)
    ) {
      return direction
    }

    // MuseScore がテンポ記号を Leland Text の私用領域グリフと words に
    // 分けて出力する場合がある。OSMD ではそのグリフを描画できないため、
    // 表示されている「= 数値」を標準 MusicXML の metronome に戻す。
    const directionText = direction
      .replace(/<[^>]+>/g, '')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&#160;', ' ')
    const tempoMatch = directionText.match(/=\s*(\d+(?:\.\d+)?)/)
    if (!tempoMatch || !DIRECTION_TYPE_TAG_PATTERN.test(direction)) {
      return direction
    }

    return direction.replace(
      DIRECTION_TYPE_TAG_PATTERN,
      `<direction-type>
          <metronome parentheses="no">
            <beat-unit>quarter</beat-unit>
            <per-minute>${tempoMatch[1]}</per-minute>
            </metronome>
          </direction-type>`
    )
  })

const tpcToMusicXmlPitch = (value: string): MusicXmlPitch | null => {
  if (!value.trim()) return null

  const tpc = Number(value)
  if (!Number.isFinite(tpc)) return null

  const step = STEP_BY_INDEX[modulo((tpc - 14) * 4, 7)]
  if (!step) return null

  const alter = (tpc - NATURAL_TPC_BY_STEP[step]) / 7
  if (!Number.isInteger(alter)) return null

  return { step, alter }
}

const getChordKind = (name: string): ChordKind => {
  const normalized = name.trim()
  return (
    CHORD_KIND_BY_NAME[normalized] ?? {
      kind: 'major',
      text: normalized || undefined,
    }
  )
}

const findMscxFile = async (fileBinary: Uint8Array): Promise<string | null> => {
  if (fileBinary.byteLength === 0) {
    logger.warn('MSCZバイナリが空のためMSCXを読み込めません')
    return null
  }

  try {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(fileBinary)
    const mscxEntry = Object.values(zip.files).find(
      (entry) => !entry.dir && entry.name.toLowerCase().endsWith('.mscx')
    )

    return mscxEntry ? await mscxEntry.async('string') : null
  } catch (error) {
    logger.warn('MSCZ内のMSCX読み込みに失敗しました:', error)
    return null
  }
}

const extractMscxHarmonies = (doc: Document): MscxHarmony[] => {
  return Array.from(doc.querySelectorAll('Harmony'))
    .map((harmony) => {
      const harmonyInfo = getDirectChild(harmony, 'harmonyInfo')
      if (!harmonyInfo) return null
      const rootTpc = getDirectChildText(harmonyInfo, 'root')
      const bassTpc = getDirectChildText(harmonyInfo, 'bass')

      return {
        root: tpcToMusicXmlPitch(rootTpc),
        bass: tpcToMusicXmlPitch(bassTpc),
        name: getDirectChildText(harmonyInfo, 'name'),
      }
    })
    .filter((harmony): harmony is MscxHarmony => Boolean(harmony?.root))
}

const extractMscxChordPlayback = (doc: Document): MscxChordPlayback[] => {
  return Array.from(doc.querySelectorAll('Chord')).map((chord) => {
    const subtype = getDirectChild(chord, 'TremoloSingleChord')?.querySelector(
      ':scope > subtype'
    )?.textContent
    const denominator = Number(subtype?.match(/^r(\d+)$/)?.[1])
    const tremoloMarks = Math.log2(denominator) - 2

    return {
      tremoloMarks:
        Number.isInteger(tremoloMarks) && tremoloMarks >= 1
          ? tremoloMarks
          : null,
    }
  })
}

const parseStandardFifths = (keySignature: Element): number | null => {
  const value =
    getDirectChildText(keySignature, 'concertKey') ||
    getDirectChildText(keySignature, 'accidental')
  const fifths = Number(value)

  return Number.isInteger(fifths) && Math.abs(fifths) <= 7 ? fifths : null
}

const extractMscxStaffNotations = (doc: Document): MscxStaffNotation[] => {
  const score = doc.querySelector('Score')
  if (!score) return []

  const parts = getDirectChildren(score, 'Part')
  const staves = getDirectChildren(score, 'Staff')
  const staffCounts = parts.map(
    (part) => getDirectChildren(part, 'Staff').length
  )

  if (staffCounts.reduce((sum, count) => sum + count, 0) !== staves.length) {
    logger.warn('譜表数が一致しないため調号補正をスキップしました', {
      partStaffCount: staffCounts.reduce((sum, count) => sum + count, 0),
      scoreStaffCount: staves.length,
    })
    return []
  }

  const notations: MscxStaffNotation[] = []
  let sourceStaffIndex = 0

  staffCounts.forEach((staffCount, partIndex) => {
    for (let staffNumber = 1; staffNumber <= staffCount; staffNumber += 1) {
      const staff = staves[sourceStaffIndex++]
      if (!staff) continue

      const keySignatures: MscxKeySignature[] = []
      const explicitAccidentalsByMeasure: boolean[][] = []

      getDirectChildren(staff, 'Measure').forEach((measure, measureIndex) => {
        const voices = getDirectChildren(measure, 'voice')
        const keySignature = voices
          .flatMap((voice) => getDirectChildren(voice, 'KeySig'))
          .find((candidate) => parseStandardFifths(candidate) !== null)
        const fifths = keySignature ? parseStandardFifths(keySignature) : null

        if (fifths !== null) {
          keySignatures.push({ measureIndex, fifths })
        }

        explicitAccidentalsByMeasure.push(
          voices.flatMap((voice) =>
            getDirectChildren(voice, 'Chord').flatMap((chord) =>
              getDirectChildren(chord, 'Note').map((note) =>
                Boolean(getDirectChild(note, 'Accidental'))
              )
            )
          )
        )
      })

      notations.push({
        partIndex,
        staffNumber,
        keySignatures,
        explicitAccidentalsByMeasure,
      })
    }
  })

  return notations
}

const DURATION_IN_WHOLE_NOTES: Record<string, number> = {
  longa: 4,
  breve: 2,
  whole: 1,
  half: 1 / 2,
  quarter: 1 / 4,
  eighth: 1 / 8,
  '16th': 1 / 16,
  '32nd': 1 / 32,
  '64th': 1 / 64,
  '128th': 1 / 128,
  '256th': 1 / 256,
  '512th': 1 / 512,
  '1024th': 1 / 1024,
}

const parseFraction = (value: string): number | null => {
  const match = value.trim().match(/^(-?\d+)\/(\d+)$/)
  if (!match) return null

  const numerator = Number(match[1])
  const denominator = Number(match[2])
  if (!Number.isFinite(numerator) || denominator <= 0) return null
  return numerator / denominator
}

const getMscxDuration = (element: Element, tupletRatio: number): number => {
  const explicitDuration = parseFraction(
    getDirectChildText(element, 'duration')
  )
  if (explicitDuration !== null) return explicitDuration

  const durationType = getDirectChildText(element, 'durationType')
  const baseDuration = DURATION_IN_WHOLE_NOTES[durationType] ?? 0
  const dots = Number(getDirectChildText(element, 'dots') || '0')
  let dottedMultiplier = 1
  for (let index = 1; index <= dots; index += 1) {
    dottedMultiplier += 1 / 2 ** index
  }

  return baseDuration * dottedMultiplier * tupletRatio
}

const normalizeMscxSwingUnit = (value: string): MscxSwingUnit | undefined => {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'eighth' || normalized === '8th') return 'eighth'
  if (normalized === '16th' || normalized === 'sixteenth') return '16th'
  return undefined
}

const extractMscxSwingMarkers = (doc: Document): MscxSwingMarker[] => {
  const partByStaffId = new Map<
    string,
    { partIndex: number; staffNumber: number }
  >()

  Array.from(doc.querySelectorAll('Score > Part')).forEach(
    (part, partIndex) => {
      Array.from(part.querySelectorAll(':scope > Staff')).forEach(
        (staff, staffIndex) => {
          const staffId = staff.getAttribute('id')
          if (staffId) {
            partByStaffId.set(staffId, {
              partIndex,
              staffNumber: staffIndex + 1,
            })
          }
        }
      )
    }
  )

  const markers: MscxSwingMarker[] = []
  doc.querySelectorAll('Score > Staff').forEach((staff) => {
    const staffId = staff.getAttribute('id')
    const staffTarget = staffId ? partByStaffId.get(staffId) : undefined

    Array.from(staff.querySelectorAll(':scope > Measure')).forEach(
      (measure, measureIndex) => {
        measure.querySelectorAll(':scope > voice').forEach((voice) => {
          let cursor = 0
          const tupletRatios: number[] = []

          Array.from(voice.children).forEach((child) => {
            if (child.tagName === 'location') {
              cursor +=
                parseFraction(getDirectChildText(child, 'fractions')) ?? 0
              return
            }

            if (child.tagName === 'Tuplet') {
              const normalNotes = Number(
                getDirectChildText(child, 'normalNotes')
              )
              const actualNotes = Number(
                getDirectChildText(child, 'actualNotes')
              )
              tupletRatios.push(
                normalNotes > 0 && actualNotes > 0
                  ? normalNotes / actualNotes
                  : 1
              )
              return
            }

            if (child.tagName === 'endTuplet') {
              tupletRatios.pop()
              return
            }

            if (child.tagName === 'Chord' || child.tagName === 'Rest') {
              const tupletRatio = tupletRatios.reduce(
                (ratio, value) => ratio * value,
                1
              )
              cursor += getMscxDuration(child, tupletRatio)
              return
            }

            if (
              child.tagName !== 'SystemText' &&
              child.tagName !== 'StaffText'
            ) {
              return
            }

            const swing = getDirectChild(child, 'swing')
            if (!swing) return

            const unit = normalizeMscxSwingUnit(
              swing.getAttribute('unit') ?? ''
            )
            const ratio = Number(swing.getAttribute('ratio') ?? '60')
            if (
              unit === undefined ||
              !Number.isFinite(ratio) ||
              ratio < 50 ||
              ratio >= 100
            ) {
              logger.warn('対応していないSwing設定をスキップしました', {
                unit: swing.getAttribute('unit'),
                ratio: swing.getAttribute('ratio'),
              })
              return
            }

            const isSystemText = child.tagName === 'SystemText'
            if (!isSystemText && !staffTarget) {
              logger.warn('Swing設定の対象譜表を特定できませんでした', {
                staffId,
              })
              return
            }

            markers.push({
              measureIndex,
              offsetInWholeNotes: Math.max(0, cursor),
              unit,
              ratio,
              partIndex: isSystemText ? null : staffTarget!.partIndex,
              staffNumber: isSystemText ? null : staffTarget!.staffNumber,
            })
          })
        })
      }
    )
  })

  return markers
}

const parseMscxPlaybackData = (mscx: string): MscxPlaybackData | null => {
  const doc = new DOMParser().parseFromString(mscx, 'application/xml')
  if (doc.querySelector('parsererror')) return null

  return {
    harmonies: extractMscxHarmonies(doc),
    chordPlayback: extractMscxChordPlayback(doc),
    swingMarkers: extractMscxSwingMarkers(doc),
    staffNotations: extractMscxStaffNotations(doc),
  }
}

const getMeasureAttributes = (measure: Element): Element[] =>
  getDirectChildren(measure, 'attributes')

const getOriginalKeyChanges = (
  measures: Element[],
  staffCount: number
): Array<Array<number | null>> => {
  return measures.map((measure) => {
    const changes = Array<number | null>(staffCount).fill(null)

    getMeasureAttributes(measure).forEach((attributes) => {
      getDirectChildren(attributes, 'key').forEach((key) => {
        const fifths = Number(getDirectChildText(key, 'fifths'))
        if (!Number.isInteger(fifths) || Math.abs(fifths) > 7) return

        const number = Number(key.getAttribute('number'))
        if (Number.isInteger(number) && number >= 1 && number <= staffCount) {
          changes[number - 1] = fifths
          return
        }

        changes.fill(fifths)
      })
    })

    return changes
  })
}

const createMusicXmlKey = (
  doc: XMLDocument,
  fifths: number,
  staffNumber: number | null
): Element => {
  const key = doc.createElement('key')
  if (staffNumber !== null) key.setAttribute('number', String(staffNumber))
  const fifthsElement = doc.createElement('fifths')
  fifthsElement.textContent = String(fifths)
  key.append(fifthsElement)
  return key
}

const replaceMeasureKeys = (
  doc: XMLDocument,
  measure: Element,
  fifthsByStaff: number[]
): void => {
  const existingAttributes = getMeasureAttributes(measure)
  existingAttributes.forEach((attributes) => {
    getDirectChildren(attributes, 'key').forEach((key) => key.remove())
  })

  let attributes = existingAttributes[0]
  if (!attributes) {
    attributes = doc.createElement('attributes')
    const firstTimedElement = Array.from(measure.children).find((child) =>
      ['direction', 'harmony', 'note', 'backup', 'forward'].includes(
        child.tagName
      )
    )
    measure.insertBefore(attributes, firstTimedElement ?? null)
  }

  const allStavesUseSameKey = fifthsByStaff.every(
    (fifths) => fifths === fifthsByStaff[0]
  )
  const keys = allStavesUseSameKey
    ? [createMusicXmlKey(doc, fifthsByStaff[0] ?? 0, null)]
    : fifthsByStaff.map((fifths, index) =>
        createMusicXmlKey(doc, fifths, index + 1)
      )
  const insertionPoint = Array.from(attributes.children).find((child) =>
    [
      'time',
      'staves',
      'part-symbol',
      'instruments',
      'clef',
      'staff-details',
      'transpose',
      'directive',
      'measure-style',
    ].includes(child.tagName)
  )
  keys.forEach((key) => attributes.insertBefore(key, insertionPoint ?? null))
}

const removeGeneratedKeyAccidentals = ({
  activeOriginalFifths,
  activeSourceFifths,
  measure,
  measureIndex,
  staffNotations,
}: {
  activeOriginalFifths: number[]
  activeSourceFifths: Array<number | null>
  measure: Element
  measureIndex: number
  staffNotations: MscxStaffNotation[]
}): void => {
  const pitchedNotesByStaff = Array.from(
    { length: staffNotations.length },
    () => [] as Element[]
  )

  getDirectChildren(measure, 'note').forEach((note) => {
    if (!getDirectChild(note, 'pitch')) return
    const staffNumber = Number(getDirectChildText(note, 'staff') || '1')
    pitchedNotesByStaff[staffNumber - 1]?.push(note)
  })

  pitchedNotesByStaff.forEach((notes, staffIndex) => {
    const sourceFlags =
      staffNotations[staffIndex]?.explicitAccidentalsByMeasure[measureIndex]
    if (!sourceFlags || sourceFlags.length !== notes.length) {
      if (notes.some((note) => getDirectChild(note, 'accidental'))) {
        logger.warn(
          '音符数が一致しないため不要な臨時記号の除去をスキップしました',
          {
            measureIndex,
            musicXmlNoteCount: notes.length,
            sourceNoteCount: sourceFlags?.length ?? 0,
            staffNumber: staffIndex + 1,
          }
        )
      }
      return
    }

    const sourceFifths = activeSourceFifths[staffIndex]
    if (
      sourceFifths === null ||
      sourceFifths === activeOriginalFifths[staffIndex]
    ) {
      return
    }

    notes.forEach((note, noteIndex) => {
      if (sourceFlags[noteIndex]) return

      const accidental = getDirectChild(note, 'accidental')
      const pitch = getDirectChild(note, 'pitch')
      const step = pitch ? getDirectChildText(pitch, 'step') : ''
      const alter = Number(pitch ? getDirectChildText(pitch, 'alter') : '0')
      if (
        !accidental ||
        !isPitchStep(step) ||
        !Number.isFinite(alter) ||
        Array.from(accidental.attributes).some(({ name }) =>
          ['bracket', 'cautionary', 'editorial', 'parentheses'].includes(name)
        )
      ) {
        return
      }

      if (
        isAccidentalImpliedByKeySignature({
          accidental: accidental.textContent?.trim() ?? '',
          alter,
          fifths: sourceFifths,
          step,
        })
      ) {
        accidental.remove()
      }
    })
  })
}

const restoreKeySignatures = (
  musicXml: string,
  staffNotations: MscxStaffNotation[]
): string => {
  if (!staffNotations.some(({ keySignatures }) => keySignatures.length > 0)) {
    return musicXml
  }

  const doc = new DOMParser().parseFromString(musicXml, 'application/xml')
  if (doc.querySelector('parsererror')) return musicXml

  const parts = Array.from(doc.querySelectorAll('score-partwise > part'))
  const sourcePartCount =
    Math.max(...staffNotations.map(({ partIndex }) => partIndex), -1) + 1
  if (parts.length !== sourcePartCount) {
    logger.warn('パート数が一致しないため調号補正をスキップしました', {
      musicXmlPartCount: parts.length,
      mscxPartCount: sourcePartCount,
    })
    return musicXml
  }

  parts.forEach((part, partIndex) => {
    const partStaffNotations = staffNotations
      .filter((notation) => notation.partIndex === partIndex)
      .sort((left, right) => left.staffNumber - right.staffNumber)
    if (
      partStaffNotations.length === 0 ||
      !partStaffNotations.some(({ keySignatures }) => keySignatures.length > 0)
    ) {
      return
    }

    const measures = getDirectChildren(part, 'measure')
    const sourceMeasureCounts = new Set(
      partStaffNotations.map(
        ({ explicitAccidentalsByMeasure }) =>
          explicitAccidentalsByMeasure.length
      )
    )
    const declaredStaffCount = Number(
      measures
        .flatMap((measure) => getMeasureAttributes(measure))
        .map((attributes) => getDirectChildText(attributes, 'staves'))
        .find(Boolean) ?? '1'
    )
    if (
      sourceMeasureCounts.size !== 1 ||
      !sourceMeasureCounts.has(measures.length) ||
      declaredStaffCount !== partStaffNotations.length
    ) {
      logger.warn(
        'パート内の譜表数または小節数が一致しないため調号補正をスキップしました',
        {
          musicXmlMeasureCount: measures.length,
          musicXmlStaffCount: declaredStaffCount,
          mscxMeasureCounts: Array.from(sourceMeasureCounts),
          mscxStaffCount: partStaffNotations.length,
          partIndex,
        }
      )
      return
    }

    const originalChanges = getOriginalKeyChanges(
      measures,
      partStaffNotations.length
    )
    const sourceChangesByMeasure = new Map<number, Map<number, number>>()
    partStaffNotations.forEach(({ keySignatures, staffNumber }) => {
      keySignatures.forEach(({ fifths, measureIndex }) => {
        const changes = sourceChangesByMeasure.get(measureIndex) ?? new Map()
        changes.set(staffNumber - 1, fifths)
        sourceChangesByMeasure.set(measureIndex, changes)
      })
    })

    const activeOriginalFifths = Array<number>(partStaffNotations.length).fill(
      0
    )
    const activeSourceFifths = Array<number | null>(
      partStaffNotations.length
    ).fill(null)

    measures.forEach((measure, measureIndex) => {
      originalChanges[measureIndex]?.forEach((fifths, staffIndex) => {
        if (fifths !== null) activeOriginalFifths[staffIndex] = fifths
      })

      const sourceChanges = sourceChangesByMeasure.get(measureIndex)
      sourceChanges?.forEach((fifths, staffIndex) => {
        activeSourceFifths[staffIndex] = fifths
      })

      if (sourceChanges) {
        replaceMeasureKeys(
          doc,
          measure,
          activeSourceFifths.map(
            (fifths, staffIndex) =>
              fifths ?? activeOriginalFifths[staffIndex] ?? 0
          )
        )
      }

      removeGeneratedKeyAccidentals({
        activeOriginalFifths,
        activeSourceFifths,
        measure,
        measureIndex,
        staffNotations: partStaffNotations,
      })
    })
  })

  return new XMLSerializer().serializeToString(doc)
}

const addTremoloNotation = (noteXml: string, marks: number): string => {
  const tremolo = `<tremolo type="single">${marks}</tremolo>`

  if (/<ornaments\b/.test(noteXml)) {
    return noteXml.replace(/<\/ornaments>/, `${tremolo}</ornaments>`)
  }
  if (/<notations\b/.test(noteXml)) {
    return noteXml.replace(
      /<\/notations>/,
      `<ornaments>${tremolo}</ornaments></notations>`
    )
  }

  const notation = `<notations><ornaments>${tremolo}</ornaments></notations>`
  return /<(lyric|play|listen)\b/.test(noteXml)
    ? noteXml.replace(/<(lyric|play|listen)\b/, `${notation}<$1`)
    : noteXml.replace(/<\/note>/, `${notation}</note>`)
}

const restoreTremolos = (
  musicXml: string,
  chordPlayback: MscxChordPlayback[]
): string => {
  if (!chordPlayback.some(({ tremoloMarks }) => tremoloMarks !== null)) {
    return musicXml
  }

  const playableNotes = musicXml
    .match(NOTE_TAG_PATTERN)
    ?.filter((note) => !/<rest\b/.test(note) && !/<chord\s*\/?\s*>/.test(note))
  if (!playableNotes || playableNotes.length !== chordPlayback.length) {
    logger.warn('Chord数が一致しないためロール補正をスキップしました', {
      musicXmlChordCount: playableNotes?.length ?? 0,
      mscxChordCount: chordPlayback.length,
    })
    return musicXml
  }

  let chordIndex = 0
  return musicXml.replace(NOTE_TAG_PATTERN, (note) => {
    if (/<rest\b/.test(note) || /<chord\s*\/?\s*>/.test(note)) return note

    const tremoloMarks = chordPlayback[chordIndex++]?.tremoloMarks
    return tremoloMarks === null || tremoloMarks === undefined
      ? note
      : addTremoloNotation(note, tremoloMarks)
  })
}

const addPitchXml = (
  lines: string[],
  tagName: 'root' | 'bass',
  pitch: MusicXmlPitch
) => {
  const prefix = tagName === 'root' ? 'root' : 'bass'
  const arrangement = tagName === 'bass' ? ' arrangement="horizontal"' : ''

  lines.push(`        <${tagName}${arrangement}>`)
  lines.push(`          <${prefix}-step>${pitch.step}</${prefix}-step>`)
  if (pitch.alter !== 0) {
    lines.push(`          <${prefix}-alter>${pitch.alter}</${prefix}-alter>`)
  }
  lines.push(`          </${tagName}>`)
}

const buildHarmonyXml = (harmony: MscxHarmony): string => {
  const lines = ['<harmony print-frame="no">']
  const chordKind = getChordKind(harmony.name)

  if (harmony.root) {
    addPitchXml(lines, 'root', harmony.root)
  }

  const text = chordKind.text ? ` text="${escapeXml(chordKind.text)}"` : ''
  lines.push(`        <kind${text}>${chordKind.kind}</kind>`)

  if (harmony.bass) {
    addPitchXml(lines, 'bass', harmony.bass)
  }

  lines.push('        </harmony>')
  return lines.join('\n')
}

const greatestCommonDivisor = (left: number, right: number): number => {
  let a = Math.abs(left)
  let b = Math.abs(right)
  while (b !== 0) {
    const remainder = a % b
    a = b
    b = remainder
  }
  return a || 1
}

const createSwingDirection = (
  doc: XMLDocument,
  marker: MscxSwingMarker,
  divisions: number
): Element => {
  const direction = doc.createElement('direction')
  direction.setAttribute('print-object', 'no')
  const directionType = doc.createElement('direction-type')
  const otherDirection = doc.createElement('other-direction')
  otherDirection.setAttribute('print-object', 'no')
  directionType.append(otherDirection)
  direction.append(directionType)

  const offset = doc.createElement('offset')
  offset.setAttribute('sound', 'yes')
  offset.textContent = String(
    Math.round(marker.offsetInWholeNotes * divisions * 4)
  )
  direction.append(offset)

  if (marker.staffNumber !== null) {
    const staff = doc.createElement('staff')
    staff.textContent = String(marker.staffNumber)
    direction.append(staff)
  }

  const sound = doc.createElement('sound')
  const swing = doc.createElement('swing')
  if (marker.unit === null) {
    swing.append(doc.createElement('straight'))
  } else {
    const roundedRatio = Math.round(marker.ratio)
    const divisor = greatestCommonDivisor(roundedRatio, 100 - roundedRatio)
    const first = doc.createElement('first')
    first.textContent = String(roundedRatio / divisor)
    const second = doc.createElement('second')
    second.textContent = String((100 - roundedRatio) / divisor)
    const swingType = doc.createElement('swing-type')
    swingType.textContent = marker.unit
    swing.append(first, second, swingType)
  }
  sound.append(swing)
  direction.append(sound)

  return direction
}

const restoreSwingDirections = (
  musicXml: string,
  swingMarkers: MscxSwingMarker[]
): string => {
  if (swingMarkers.length === 0) return musicXml

  const doc = new DOMParser().parseFromString(musicXml, 'application/xml')
  if (doc.querySelector('parsererror')) return musicXml

  // MSCXを正として復元するため、webmscoreが一部だけ出力した場合も
  // 重複や競合が起きないよう既存のSwing再生情報を置き換える。
  doc.querySelectorAll('sound > swing').forEach((swing) => swing.remove())

  const parts = Array.from(doc.querySelectorAll('score-partwise > part'))
  const divisionsByPart = new Map<number, number>()

  const getDivisions = (partIndex: number, measureIndex: number) => {
    const cached = divisionsByPart.get(partIndex) ?? 1
    const part = parts[partIndex]
    const measures = part
      ? Array.from(part.querySelectorAll(':scope > measure'))
      : []
    let divisions = 1
    for (let index = 0; index <= measureIndex; index += 1) {
      const value = Number(
        measures[index]?.querySelector(':scope > attributes > divisions')
          ?.textContent
      )
      if (Number.isFinite(value) && value > 0) divisions = value
    }
    divisionsByPart.set(partIndex, divisions || cached)
    return divisions || cached
  }

  swingMarkers.forEach((marker) => {
    const targetPartIndexes =
      marker.partIndex === null
        ? parts.map((_, index) => index)
        : [marker.partIndex]

    targetPartIndexes.forEach((partIndex) => {
      const part = parts[partIndex]
      const measure = part
        ? Array.from(part.querySelectorAll(':scope > measure'))[
            marker.measureIndex
          ]
        : undefined
      if (!measure) {
        logger.warn('Swing設定の対象小節を特定できませんでした', {
          partIndex,
          measureIndex: marker.measureIndex,
        })
        return
      }

      const direction = createSwingDirection(
        doc,
        marker,
        getDivisions(partIndex, marker.measureIndex)
      )
      const firstTimedElement = Array.from(measure.children).find((child) =>
        ['note', 'direction', 'backup', 'forward'].includes(child.tagName)
      )
      measure.insertBefore(direction, firstTimedElement ?? null)
    })
  })

  return new XMLSerializer().serializeToString(doc)
}

const restorePlaybackMetadataFromMscz = async (
  musicXml: string,
  fileBinary: Uint8Array
): Promise<RestorePlaybackMetadataResult> => {
  const mscx = await findMscxFile(fileBinary)
  if (!mscx) {
    return {
      musicXml,
    }
  }

  const playbackData = parseMscxPlaybackData(mscx)
  if (!playbackData) return { musicXml }

  const { harmonies, chordPlayback, staffNotations, swingMarkers } =
    playbackData
  const musicXmlWithKeySignatures = restoreKeySignatures(
    musicXml,
    staffNotations
  )
  const musicXmlWithTremolos = restoreTremolos(
    musicXmlWithKeySignatures,
    chordPlayback
  )
  if (!harmonies.length) {
    return {
      musicXml: restoreSwingDirections(musicXmlWithTremolos, swingMarkers),
    }
  }

  const harmonyMatches = musicXml.match(HARMONY_TAG_PATTERN) ?? []
  if (harmonyMatches.length !== harmonies.length) {
    logger.warn('Harmony数が一致しないためコード補正をスキップしました', {
      musicXmlHarmonyCount: harmonyMatches.length,
      mscxHarmonyCount: harmonies.length,
    })
    return {
      musicXml: restoreSwingDirections(musicXmlWithTremolos, swingMarkers),
    }
  }

  let harmonyIndex = 0
  const musicXmlWithHarmonies = musicXmlWithTremolos.replace(
    HARMONY_TAG_PATTERN,
    () => buildHarmonyXml(harmonies[harmonyIndex++])
  )
  return {
    musicXml: restoreSwingDirections(musicXmlWithHarmonies, swingMarkers),
  }
}

const replaceMxlScoreXml = async (
  musicMxl: Uint8Array,
  musicXml: string
): Promise<Uint8Array> => {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(musicMxl)
  const containerEntry = zip.file('META-INF/container.xml')
  const containerXml = containerEntry
    ? await containerEntry.async('string')
    : null
  const containerDoc = containerXml
    ? new DOMParser().parseFromString(containerXml, 'application/xml')
    : null
  const rootFilePath = containerDoc
    ?.querySelector('rootfile')
    ?.getAttribute('full-path')
  const scoreEntry = rootFilePath
    ? zip.file(rootFilePath)
    : Object.values(zip.files).find(
        (entry) =>
          !entry.dir &&
          !entry.name.startsWith('META-INF/') &&
          /\.(musicxml|xml)$/i.test(entry.name)
      )

  if (!scoreEntry) {
    throw new Error('MXL内のMusicXMLを特定できませんでした')
  }

  zip.file(scoreEntry.name, musicXml)
  return zip.generateAsync({ compression: 'DEFLATE', type: 'uint8array' })
}

export const convertMsczToMusicXml = async (
  fileBinary: Uint8Array
): Promise<MusicScoreExport> => {
  const webMscoreBinary = fileBinary.slice()
  const msczArchiveBinary = fileBinary.slice()

  const WebMscore = (await import('webmscore')).default
  const score = await WebMscore.load('mscz', webMscoreBinary, [], true)

  const rawMusicXml = await score.saveXml()
  assertPlayableMusicXml(rawMusicXml)
  const restoreResult = await restorePlaybackMetadataFromMscz(
    rawMusicXml,
    msczArchiveBinary
  )
  const musicXml = normalizeTextTempoDirections(restoreResult.musicXml)

  let musicMxl: Uint8Array | null = null
  try {
    const rawMusicMxl = await score.saveMxl()
    musicMxl = await replaceMxlScoreXml(rawMusicMxl, musicXml)
  } catch (error) {
    logger.warn(
      'MXLの生成または補正に失敗しましたが、XMLは生成されました',
      error
    )
  }

  return { musicXml, musicMxl }
}

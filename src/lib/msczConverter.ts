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

type RestoreHarmonyResult = {
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

type MscxPlaybackData = {
  harmonies: MscxHarmony[]
  chordPlayback: MscxChordPlayback[]
  swingMarkers: MscxSwingMarker[]
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
  }
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
  const directionType = doc.createElement('direction-type')
  const words = doc.createElement('words')
  words.setAttribute('print-object', 'no')
  words.textContent = marker.unit ? 'Swing playback' : 'Straight playback'
  directionType.append(words)
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
): Promise<RestoreHarmonyResult> => {
  const mscx = await findMscxFile(fileBinary)
  if (!mscx) {
    return {
      musicXml,
    }
  }

  const playbackData = parseMscxPlaybackData(mscx)
  if (!playbackData) return { musicXml }

  const { harmonies, chordPlayback, swingMarkers } = playbackData
  const musicXmlWithTremolos = restoreTremolos(musicXml, chordPlayback)
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
    musicMxl = await score.saveMxl()
  } catch {
    logger.warn('MXLの生成に失敗しましたが、XMLは生成されました')
  }

  return { musicXml, musicMxl }
}

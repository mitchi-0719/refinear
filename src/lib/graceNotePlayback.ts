import type { NoteEvent } from './musicXmlParser'

const MAX_GRACE_NOTE_DURATION_TICKS = 24

const getVoiceKey = (event: NoteEvent) => `${event.partId}:${event.voice}`

const getGraceNoteDuration = (principal: NoteEvent, count: number) =>
  Math.max(
    1,
    Math.min(
      MAX_GRACE_NOTE_DURATION_TICKS,
      Math.floor(principal.duration / (count + 1))
    )
  )

// MusicXML の grace 要素には duration がない。そのままでは Tone.js に
// 0 tick の音価を渡すことになるため、直後の通常音の直前へ短く配置する。
export const applyGraceNotePlaybackTiming = (events: NoteEvent[]) => {
  const eventsByVoice = new Map<string, NoteEvent[]>()

  events.forEach((event) => {
    const key = getVoiceKey(event)
    const voiceEvents = eventsByVoice.get(key) ?? []
    voiceEvents.push(event)
    eventsByVoice.set(key, voiceEvents)
  })

  eventsByVoice.forEach((voiceEvents) => {
    let index = 0

    while (index < voiceEvents.length) {
      const graceStart = index
      const graceTime = voiceEvents[index]?.time
      if (!voiceEvents[index]?.isGrace || graceTime === undefined) {
        index += 1
        continue
      }

      while (
        voiceEvents[index]?.isGrace &&
        voiceEvents[index]?.time === graceTime
      ) {
        index += 1
      }

      const principal = voiceEvents[index]
      if (
        !principal ||
        principal.isGrace ||
        principal.isRest ||
        principal.time !== graceTime ||
        principal.duration <= 0
      ) {
        continue
      }

      const graceCount = index - graceStart
      const graceDuration = getGraceNoteDuration(principal, graceCount)
      const firstGraceTime = Math.max(
        0,
        principal.time - graceDuration * graceCount
      )

      for (let graceIndex = 0; graceIndex < graceCount; graceIndex += 1) {
        const grace = voiceEvents[graceStart + graceIndex]
        if (!grace) continue

        grace.time = firstGraceTime + graceDuration * graceIndex
        grace.duration = graceDuration
      }
    }
  })

  return events.sort(
    (left, right) =>
      left.time - right.time ||
      left.partId.localeCompare(right.partId) ||
      left.voice.localeCompare(right.voice)
  )
}

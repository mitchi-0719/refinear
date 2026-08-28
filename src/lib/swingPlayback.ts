export type SwingUnit = 'eighth' | '16th'

export type SwingChange = {
  partId: string
  staff: string | null
  time: number
  unit: SwingUnit | null
  ratio: number
}

export type SwingPlaybackEvent = {
  partId: string
  staff: string
  time: number
  duration: number
  nominalDuration: number
  measureStartTime: number
  noteType: string | null
  isRest: boolean
  isGrace: boolean
  hasTimeModification: boolean
}

export type SwingPlaybackTiming = {
  time: number
  duration: number
}

const TICKS_BY_SWING_UNIT: Record<SwingUnit, number> = {
  eighth: 96,
  '16th': 48,
}

const getActiveSwingChange = (
  event: SwingPlaybackEvent,
  changes: SwingChange[]
): SwingChange | null =>
  changes.reduce<SwingChange | null>((active, change) => {
    if (
      change.partId !== event.partId ||
      change.time > event.time ||
      (change.staff !== null && change.staff !== event.staff)
    ) {
      return active
    }

    if (!active || change.time > active.time) return change

    // 同じ位置では、パート全体の指定より譜表固有の指定を優先する。
    if (
      change.time === active.time &&
      change.staff !== null &&
      active.staff === null
    ) {
      return change
    }

    return active
  }, null)

const modulo = (value: number, divisor: number) =>
  ((value % divisor) + divisor) % divisor

export const getSwingPlaybackTiming = (
  event: SwingPlaybackEvent,
  changes: SwingChange[]
): SwingPlaybackTiming => {
  const unchanged = { time: event.time, duration: event.duration }
  if (
    event.isRest ||
    event.isGrace ||
    event.hasTimeModification ||
    !event.noteType
  ) {
    return unchanged
  }

  const swing = getActiveSwingChange(event, changes)
  if (!swing?.unit || swing.unit !== event.noteType) return unchanged

  const unitTicks = TICKS_BY_SWING_UNIT[swing.unit]
  if (event.nominalDuration !== unitTicks) return unchanged

  const pairTicks = unitTicks * 2
  const positionInPair = modulo(event.time - event.measureStartTime, pairTicks)
  if (positionInPair !== 0 && positionInPair !== unitTicks) return unchanged

  const ratio = Math.min(99, Math.max(50, swing.ratio))
  const adjustment = Math.round((pairTicks * (ratio - 50)) / 100)
  if (adjustment === 0) return unchanged

  if (positionInPair === 0) {
    return {
      time: event.time,
      duration: event.duration + adjustment,
    }
  }

  return {
    time: event.time + adjustment,
    duration: Math.max(1, event.duration - adjustment),
  }
}

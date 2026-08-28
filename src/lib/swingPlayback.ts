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
  measureStartTime: number
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
  partId: string,
  staff: string,
  time: number,
  changes: SwingChange[]
): SwingChange | null =>
  changes.reduce<SwingChange | null>((active, change) => {
    if (
      change.partId !== partId ||
      change.time > time ||
      (change.staff !== null && change.staff !== staff)
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

const transformSwingBoundary = (
  event: SwingPlaybackEvent,
  boundaryTime: number,
  changes: SwingChange[]
): number => {
  const swing = getActiveSwingChange(
    event.partId,
    event.staff,
    boundaryTime,
    changes
  )
  if (!swing?.unit) return boundaryTime

  const unitTicks = TICKS_BY_SWING_UNIT[swing.unit]
  const pairTicks = unitTicks * 2
  const positionInPair = modulo(
    boundaryTime - event.measureStartTime,
    pairTicks
  )
  if (positionInPair !== unitTicks) return boundaryTime

  const ratio = Math.min(99, Math.max(50, swing.ratio))
  const adjustment = Math.round((pairTicks * (ratio - 50)) / 100)
  return boundaryTime + adjustment
}

export const getSwingPlaybackTiming = (
  event: SwingPlaybackEvent,
  changes: SwingChange[]
): SwingPlaybackTiming => {
  const unchanged = { time: event.time, duration: event.duration }
  if (event.isRest || event.isGrace || event.hasTimeModification) {
    return unchanged
  }

  const time = transformSwingBoundary(event, event.time, changes)
  const endTime = transformSwingBoundary(
    event,
    event.time + event.duration,
    changes
  )

  return {
    time,
    duration: Math.max(1, endTime - time),
  }
}

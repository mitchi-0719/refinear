export const PITCH_STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const

export type PitchStep = (typeof PITCH_STEPS)[number]

const SHARP_STEPS: PitchStep[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B']
const FLAT_STEPS: PitchStep[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F']

const ACCIDENTAL_ALTER: Partial<Record<string, number>> = {
  flat: -1,
  sharp: 1,
}

export const isPitchStep = (value: string): value is PitchStep =>
  PITCH_STEPS.some((step) => step === value)

export const getKeySignatureAlter = (
  fifths: number,
  step: PitchStep
): number | null => {
  if (!Number.isInteger(fifths) || Math.abs(fifths) > 7) return null

  if (fifths > 0) {
    return SHARP_STEPS.slice(0, fifths).includes(step) ? 1 : 0
  }
  if (fifths < 0) {
    return FLAT_STEPS.slice(0, Math.abs(fifths)).includes(step) ? -1 : 0
  }
  return 0
}

export const isAccidentalImpliedByKeySignature = ({
  accidental,
  alter,
  fifths,
  step,
}: {
  accidental: string
  alter: number
  fifths: number
  step: PitchStep
}): boolean => {
  const keyAlter = getKeySignatureAlter(fifths, step)
  return (
    keyAlter !== null &&
    keyAlter !== 0 &&
    alter === keyAlter &&
    ACCIDENTAL_ALTER[accidental] === keyAlter
  )
}

export const isOsmdGlissandoLayoutError = (error: unknown): boolean =>
  error instanceof Error &&
  error.name === 'TypeError' &&
  error.message.includes('HasEndLine')

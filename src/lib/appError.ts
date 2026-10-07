export const APP_ERROR_CODES = {
  unsupportedFileFormat: 'RF-UPLOAD-001',
  fileTooLarge: 'RF-UPLOAD-002',
  fileReadFailed: 'RF-UPLOAD-003',
  scoreConversionFailed: 'RF-CONVERT-001',
  demoFetchFailed: 'RF-DEMO-001',
  historyLoadFailed: 'RF-HISTORY-001',
  historySaveFailed: 'RF-HISTORY-002',
  historyRestoreFailed: 'RF-HISTORY-003',
  historyUpdateFailed: 'RF-HISTORY-004',
  historyDeleteFailed: 'RF-HISTORY-005',
  scoreRenderFailed: 'RF-RENDER-001',
  partVisibilityFailed: 'RF-RENDER-002',
} as const

export type AppErrorCode =
  (typeof APP_ERROR_CODES)[keyof typeof APP_ERROR_CODES]

export type AppErrorInfo = {
  code: AppErrorCode
  message: string
  context: string
  details: string
}

type CreateAppErrorOptions = {
  context: string
  cause?: unknown
}

const MAX_ERROR_DETAILS_LENGTH = 8_000
const MAX_SERIALIZED_DEPTH = 3
const MAX_SERIALIZED_ENTRIES = 20

const truncateDetails = (details: string): string => {
  if (details.length <= MAX_ERROR_DETAILS_LENGTH) return details

  return `${details.slice(0, MAX_ERROR_DETAILS_LENGTH)}\n…（以下省略）`
}

const normalizeUnknown = (
  value: unknown,
  seen: WeakSet<object>,
  depth = 0
): unknown => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'bigint') return `${value.toString()}n`
  if (typeof value === 'undefined') return 'undefined'
  if (typeof value === 'symbol' || typeof value === 'function') {
    return String(value)
  }
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`
  }
  if (ArrayBuffer.isView(value)) {
    return `[${value.constructor.name} byteLength=${value.byteLength}]`
  }
  if (value instanceof ArrayBuffer) {
    return `[ArrayBuffer byteLength=${value.byteLength}]`
  }
  if (depth >= MAX_SERIALIZED_DEPTH) return '[Max depth reached]'
  if (seen.has(value)) return '[Circular]'

  seen.add(value)

  if (Array.isArray(value)) {
    const normalized = value
      .slice(0, MAX_SERIALIZED_ENTRIES)
      .map((item) => normalizeUnknown(item, seen, depth + 1))
    if (value.length > MAX_SERIALIZED_ENTRIES) normalized.push('…')
    return normalized
  }

  const entries = Object.entries(value).slice(0, MAX_SERIALIZED_ENTRIES)
  const normalized = Object.fromEntries(
    entries.map(([key, item]) => [key, normalizeUnknown(item, seen, depth + 1)])
  )
  if (Object.keys(value).length > MAX_SERIALIZED_ENTRIES) {
    normalized['…'] = 'remaining properties omitted'
  }
  return normalized
}

export const getErrorDetails = (cause: unknown): string => {
  if (cause instanceof Error) {
    return truncateDetails(cause.stack || `${cause.name}: ${cause.message}`)
  }

  try {
    const normalized = normalizeUnknown(cause, new WeakSet())
    const serialized =
      typeof normalized === 'string'
        ? normalized
        : JSON.stringify(normalized, null, 2)
    return truncateDetails(serialized ?? String(cause))
  } catch {
    return truncateDetails(String(cause))
  }
}

export const getErrorMessage = (
  error: unknown,
  fallbackMessage: string
): string => (error instanceof Error ? error.message : fallbackMessage)

export const createAppError = (
  code: AppErrorCode,
  message: string,
  { context, cause = message }: CreateAppErrorOptions
): AppErrorInfo => ({
  code,
  message,
  context,
  details: getErrorDetails(cause),
})

export const formatAppErrorDiagnostic = (
  error: AppErrorInfo,
  deployment: string
): string =>
  [
    `エラーコード: ${error.code}`,
    `実行環境: ${deployment}`,
    `発生箇所: ${error.context}`,
    '詳細:',
    error.details,
  ].join('\n')

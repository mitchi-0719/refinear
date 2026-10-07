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
}

export const getErrorMessage = (
  error: unknown,
  fallbackMessage: string
): string => (error instanceof Error ? error.message : fallbackMessage)

export const createAppError = (
  code: AppErrorCode,
  message: string
): AppErrorInfo => ({ code, message })

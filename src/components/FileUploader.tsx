import { useCallback, useEffect, useRef, useState } from 'react'

import { useNavigate, useSearchParams } from 'react-router-dom'

import { featureFlags } from '../config/featureFlags'
import {
  APP_ERROR_CODES,
  type AppErrorCode,
  type AppErrorInfo,
  createAppError,
  getErrorMessage,
} from '../lib/appError'
import { logger } from '../lib/logger'
import { convertMsczToMusicXml } from '../lib/msczConverter'
import {
  SCORE_CACHE_VERSION,
  SCORE_CONVERTER_VERSION,
  type ScoreHistoryItem,
  createScoreId,
  deleteCachedScore,
  getCachedScore,
  getCachedScoreCompatibility,
  listRecentScores,
  saveCachedScore,
  touchCachedScore,
} from '../lib/scoreHistory'
import { showSnackbar } from '../lib/snackbar'
import { useScoreStore } from '../stores/useScoreStore'
import { Alert, AlertDescription, AlertTitle } from './ui/Alert'
import { ErrorDetails } from './ui/ErrorDetails'
import { Icon } from './ui/Icon'

const formatOpenedAt = (timestamp: number) =>
  new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(timestamp)

const getUploadErrorContent = (error: AppErrorInfo) => {
  if (error.code === APP_ERROR_CODES.unsupportedFileFormat) {
    return {
      title: 'ファイル形式を確認してください',
      description: '拡張子が .mscz のMuseScoreファイルを選択してください。',
    }
  }
  if (error.code === APP_ERROR_CODES.fileTooLarge) {
    return {
      title: 'ファイルサイズが上限を超えています',
      description: '100MB以下のMSCZファイルを選択してください。',
    }
  }
  if (error.code === APP_ERROR_CODES.scoreConversionFailed) {
    return {
      title: '楽譜を読み取れませんでした',
      description:
        'MuseScoreで楽譜を開き、最新版のMSCZとして保存し直してからお試しください。',
    }
  }
  if (error.code === APP_ERROR_CODES.demoFetchFailed) {
    return {
      title: 'サンプル楽譜を読み込めませんでした',
      description: '通信状態を確認して、もう一度お試しください。',
    }
  }
  return {
    title: '楽譜を開けませんでした',
    description: `${error.message} 別のファイルを選ぶか、もう一度お試しください。`,
  }
}

export const FileUploader = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [isDragging, setIsDragging] = useState(false)
  const [history, setHistory] = useState<ScoreHistoryItem[]>([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<AppErrorInfo | null>(null)
  const [storageWarning, setStorageWarning] = useState<AppErrorInfo | null>(
    null
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasAutoLoadedDemoRef = useRef(false)

  const setConvertedScore = useScoreStore((s) => s.setConvertedScore)
  const setLoading = useScoreStore((s) => s.setLoading)
  const setError = useScoreStore((s) => s.setError)
  const error = useScoreStore((s) => s.error)
  const isLoading = useScoreStore((s) => s.isLoading)
  const fileName = useScoreStore((s) => s.fileName)
  const musicXml = useScoreStore((s) => s.musicXml)

  const hasLoadedScore = Boolean(fileName && musicXml && !isLoading)
  const isHistoryBusy = restoringId !== null || deletingId !== null
  const uploadErrorContent = error ? getUploadErrorContent(error) : null

  const refreshHistory = useCallback(async () => {
    setIsHistoryLoading(true)
    try {
      setHistory(await listRecentScores())
      setHistoryError(null)
    } catch (err) {
      const historyLoadError = createAppError(
        APP_ERROR_CODES.historyLoadFailed,
        getErrorMessage(err, '履歴を読み込めませんでした'),
        { context: '履歴の読み込み', cause: err }
      )
      logger.appError(historyLoadError, err)
      setHistoryError(historyLoadError)
    } finally {
      setIsHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void listRecentScores()
      .then((items) => {
        if (cancelled) return
        setHistory(items)
        setHistoryError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const historyLoadError = createAppError(
          APP_ERROR_CODES.historyLoadFailed,
          getErrorMessage(err, '履歴を読み込めませんでした'),
          { context: '履歴の読み込み', cause: err }
        )
        logger.appError(historyLoadError, err)
        setHistoryError(historyLoadError)
      })
      .finally(() => {
        if (!cancelled) setIsHistoryLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  /**
   * ファイルを処理（MSCZ → MusicXML 変換）
   */
  const processFile = useCallback(
    async (file: File, saveToHistory = true) => {
      let failureCode: AppErrorCode = APP_ERROR_CODES.fileReadFailed

      try {
        // ファイル形式の検証
        const validExtensions = ['.mscz']
        const fileName = file.name.toLowerCase()
        const isValid = validExtensions.some((ext) => fileName.endsWith(ext))

        if (!isValid) {
          const uploadError = createAppError(
            APP_ERROR_CODES.unsupportedFileFormat,
            '対応していないファイル形式です。MSCZ ファイルをお選びください。',
            { context: 'ファイル形式の検証' }
          )
          logger.appError(uploadError)
          setError(uploadError)
          return
        }

        // ファイルサイズの検証（100 MB まで）
        const maxSize = 100 * 1024 * 1024
        if (file.size > maxSize) {
          const uploadError = createAppError(
            APP_ERROR_CODES.fileTooLarge,
            'ファイルサイズが大きすぎます。100 MB 以下のファイルをお選びください。',
            { context: 'ファイルサイズの検証' }
          )
          logger.appError(uploadError)
          setError(uploadError)
          return
        }

        setLoading(true)
        setError(null)
        setStorageWarning(null)

        // ファイルをバイナリとして読み込み
        const arrayBuffer = await file.arrayBuffer()
        const binary = new Uint8Array(arrayBuffer)

        // webmscore で MusicXML に変換
        failureCode = APP_ERROR_CODES.scoreConversionFailed
        const { musicXml, musicMxl } = await convertMsczToMusicXml(binary)

        // 結果を一括で格納
        setConvertedScore({
          fileName: file.name,
          fileBinary: binary,
          musicXml,
          musicMxl,
        })

        if (saveToHistory) {
          try {
            const now = Date.now()
            const id = await createScoreId(binary)
            await saveCachedScore({
              id,
              fileName: file.name,
              fileSize: file.size,
              fileLastModified: file.lastModified,
              openedAt: now,
              createdAt: now,
              musicXml,
              musicMxl,
              cacheVersion: SCORE_CACHE_VERSION,
              converterVersion: SCORE_CONVERTER_VERSION,
            })
            await refreshHistory()
          } catch (historySaveError) {
            const storageError = createAppError(
              APP_ERROR_CODES.historySaveFailed,
              '楽譜は開けましたが、この端末に履歴を保存できませんでした。',
              { context: '履歴の保存', cause: historySaveError }
            )
            logger.appError(storageError, historySaveError)
            setStorageWarning(storageError)
          }
        }
      } catch (err) {
        const uploadError = createAppError(
          failureCode,
          getErrorMessage(err, '不明なエラーが発生しました'),
          { context: 'ファイルの読み込み・変換', cause: err }
        )
        logger.appError(uploadError, err)
        setError(uploadError)
        setLoading(false)
      }
    },
    [refreshHistory, setConvertedScore, setLoading, setError]
  )

  const openFromHistory = useCallback(
    async (item: ScoreHistoryItem) => {
      if (isHistoryBusy || isLoading) return

      setRestoringId(item.id)
      setHistoryError(null)
      setStorageWarning(null)
      setLoading(true)

      try {
        if (getCachedScoreCompatibility(item) === 'incompatible') {
          await deleteCachedScore(item.id)
          await refreshHistory()
          throw new Error(
            'この履歴は現在のバージョンでは開けません。MSCZファイルを再度選択してください。'
          )
        }

        const cachedScore = await getCachedScore(item.id)
        const compatibility = cachedScore
          ? getCachedScoreCompatibility(cachedScore)
          : 'incompatible'
        if (
          !cachedScore ||
          compatibility === 'incompatible' ||
          typeof cachedScore.musicXml !== 'string' ||
          cachedScore.musicXml.length === 0
        ) {
          await deleteCachedScore(item.id)
          await refreshHistory()
          throw new Error(
            '履歴データを読み込めません。MSCZファイルを再度選択してください。'
          )
        }

        if (compatibility === 'legacy') {
          showSnackbar({
            message:
              'ファイル情報が古いです。正確に表示するには元ファイルを再選択してください',
            variant: 'warning',
          })
        }

        setConvertedScore({
          fileName: cachedScore.fileName,
          fileBinary: null,
          musicXml: cachedScore.musicXml,
          musicMxl: cachedScore.musicMxl,
        })

        try {
          await touchCachedScore(item.id)
          await refreshHistory()
        } catch (touchError) {
          const storageError = createAppError(
            APP_ERROR_CODES.historyUpdateFailed,
            '楽譜は開けましたが、履歴の最終利用日時を更新できませんでした。',
            { context: '履歴の最終利用日時の更新', cause: touchError }
          )
          logger.appError(storageError, touchError)
          setStorageWarning(storageError)
        }
      } catch (err) {
        const historyRestoreError = createAppError(
          APP_ERROR_CODES.historyRestoreFailed,
          getErrorMessage(err, '履歴を読み込めませんでした'),
          { context: '履歴からの楽譜復元', cause: err }
        )
        logger.appError(historyRestoreError, err)
        setHistoryError(historyRestoreError)
        setLoading(false)
      } finally {
        setRestoringId(null)
      }
    },
    [isHistoryBusy, isLoading, refreshHistory, setConvertedScore, setLoading]
  )

  const removeFromHistory = useCallback(
    async (item: ScoreHistoryItem) => {
      if (isHistoryBusy || isLoading) return
      if (!window.confirm(`「${item.fileName}」を履歴から削除しますか？`))
        return

      setDeletingId(item.id)
      setHistoryError(null)
      try {
        await deleteCachedScore(item.id)
        await refreshHistory()
      } catch (err) {
        const historyDeleteError = createAppError(
          APP_ERROR_CODES.historyDeleteFailed,
          getErrorMessage(err, '履歴を削除できませんでした'),
          { context: '履歴の削除', cause: err }
        )
        logger.appError(historyDeleteError, err)
        setHistoryError(historyDeleteError)
      } finally {
        setDeletingId(null)
      }
    },
    [isHistoryBusy, isLoading, refreshHistory]
  )

  /**
   * ファイル入力の変更を処理
   */
  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file) {
        processFile(file)
      }
    },
    [processFile]
  )

  /**
   * ドラッグ&ドロップを処理
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      const file = e.dataTransfer.files?.[0]
      if (file) {
        processFile(file)
      }
    },
    [processFile]
  )

  /**
   * demo.mscz を読み込み
   */
  const loadDemoFile = useCallback(async () => {
    try {
      // public/demo.mscz を読み込み
      const response = await fetch('/demo.mscz')
      if (!response.ok) {
        throw new Error(
          `demo.mscz の読み込みに失敗しました (${response.status})`
        )
      }

      const arrayBuffer = await response.arrayBuffer()
      const demoFile = new File([arrayBuffer], 'demo.mscz', {
        type: 'application/octet-stream',
      })

      await processFile(demoFile, false)
    } catch (err) {
      const demoError = createAppError(
        APP_ERROR_CODES.demoFetchFailed,
        getErrorMessage(err, '不明なエラーが発生しました'),
        { context: 'デモ楽譜の取得・読み込み', cause: err }
      )
      logger.appError(demoError, err)
      setError(demoError)
    }
  }, [processFile, setError])

  useEffect(() => {
    if (
      !featureFlags.demoButton ||
      searchParams.get('demo') !== 'true' ||
      hasAutoLoadedDemoRef.current
    ) {
      return
    }

    hasAutoLoadedDemoRef.current = true
    navigate('/', { replace: true })
    void loadDemoFile()
  }, [loadDemoFile, navigate, searchParams])

  return (
    <section className="w-full px-5 pt-9 pb-10 sm:mx-auto sm:mt-10 sm:max-w-2xl sm:rounded-3xl sm:bg-white sm:p-8 sm:shadow-lg">
      {!hasLoadedScore && (
        <>
          <div className="mb-7">
            <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.035em] text-[#071b47] sm:text-3xl">
              楽譜を開いて、練習しよう
            </h1>
            <p className="mt-3 text-[15px] leading-6 text-slate-500">
              MuseScoreファイルを端末内で表示・再生できます
            </p>
          </div>

          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                fileInputRef.current?.click()
              }
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-2xl border bg-white p-4 shadow-[0_8px_30px_rgba(15,38,75,0.08)] transition-colors ${
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".mscz"
              onChange={handleFileInput}
              disabled={isLoading}
              className="hidden"
            />
            <div className="space-y-4 text-center">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  fileInputRef.current?.click()
                }}
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-linear-to-r from-blue-600 to-[#0876f9] px-5 py-5 text-lg font-bold text-white shadow-[0_8px_20px_rgba(24,104,242,0.22)] active:scale-[0.99] disabled:cursor-wait disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
              >
                {isLoading ? (
                  <span
                    className="size-5 animate-spin rounded-full border-2 border-white/45 border-t-white"
                    aria-hidden="true"
                  />
                ) : (
                  <Icon name="upload-file" />
                )}
                {isLoading ? '楽譜を読み込み中' : '楽譜をアップロード'}
              </button>
              {uploadErrorContent && error && (
                <Alert variant="error">
                  <AlertTitle>{uploadErrorContent.title}</AlertTitle>
                  <AlertDescription>
                    {uploadErrorContent.description}
                  </AlertDescription>
                  <ErrorDetails error={error} />
                </Alert>
              )}
              <p className="text-sm text-slate-500">対応形式 .mscz</p>
              <p className="flex items-center justify-center gap-2 text-xs text-slate-500">
                <Icon name="lock" size="small" />
                ファイルは外部に送信されません
              </p>
            </div>
          </div>

          {featureFlags.demoButton && (
            <>
              <button
                onClick={loadDemoFile}
                disabled={isLoading}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500 bg-white px-4 py-3.5 font-bold text-blue-600 disabled:bg-gray-100"
              >
                <Icon name="music-note" />
                {isLoading ? '処理中...' : 'デモ楽譜を読み込み'}
              </button>
            </>
          )}

          <div className="mt-9">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-extrabold tracking-tight text-[#071b47]">
                最近開いた楽譜
              </h2>
              {!isHistoryLoading && historyError && (
                <button
                  type="button"
                  onClick={() => void refreshHistory()}
                  disabled={isHistoryBusy}
                  className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                >
                  再読み込み
                </button>
              )}
            </div>

            {isHistoryLoading ? (
              <p className="py-3 text-sm text-slate-400">
                履歴を読み込んでいます...
              </p>
            ) : historyError ? (
              <Alert variant="error">
                <AlertTitle>履歴を読み込めませんでした</AlertTitle>
                <AlertDescription>{historyError.message}</AlertDescription>
                <ErrorDetails error={historyError} />
              </Alert>
            ) : history.length === 0 ? (
              <p className="rounded-xl border border-slate-100 bg-white px-4 py-4 text-sm text-slate-400">
                まだ開いた楽譜はありません
              </p>
            ) : (
              <ul className="space-y-3">
                {history.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_4px_16px_rgba(15,38,75,0.05)]"
                  >
                    <button
                      type="button"
                      onClick={() => void openFromHistory(item)}
                      disabled={isHistoryBusy || isLoading}
                      className="min-w-0 flex-1 px-1 py-1 text-left disabled:opacity-50"
                    >
                      <p className="truncate font-bold text-[#071b47]">
                        {item.fileName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        最後に開いた日時：{formatOpenedAt(item.openedAt)}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeFromHistory(item)}
                      disabled={isHistoryBusy || isLoading}
                      className="grid size-9 shrink-0 place-items-center rounded-full text-slate-400 active:bg-red-50 active:text-red-600 disabled:opacity-30"
                      aria-label={`${item.fileName}を履歴から削除`}
                    >
                      {deletingId === item.id ? (
                        <span className="size-4 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
                      ) : (
                        <Icon name="delete" size="small" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {storageWarning && (
        <Alert variant="info">
          <AlertTitle>履歴を保存できませんでした</AlertTitle>
          <AlertDescription>{storageWarning.message}</AlertDescription>
          <ErrorDetails error={storageWarning} />
        </Alert>
      )}

      <p className="mt-10 text-center text-xs text-slate-400">
        ブラウザだけで使えます・インストール不要
      </p>
    </section>
  )
}

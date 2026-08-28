export const SCORE_CACHE_VERSION = 1 as const
export const SCORE_CONVERTER_VERSION = 'webmscore-1.2.1-swing-1'

// Keep the legacy name so existing users retain their locally stored scores.
const DATABASE_NAME = 'musescore-player'
const DATABASE_VERSION = 1
const SCORE_STORE_NAME = 'scores'
const HISTORY_STORE_NAME = 'history'
const HISTORY_LIMIT = 5

export type CachedScore = {
  id: string
  fileName: string
  fileSize: number
  fileLastModified: number
  openedAt: number
  createdAt: number
  musicXml: string
  musicMxl: Uint8Array | null
  cacheVersion: typeof SCORE_CACHE_VERSION
  converterVersion: string
}

export type ScoreHistoryItem = Omit<CachedScore, 'musicXml' | 'musicMxl'>

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed'))
  })

const transactionToPromise = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })

const openDatabase = (): Promise<IDBDatabase> => {
  if (!('indexedDB' in globalThis)) {
    return Promise.reject(new Error('このブラウザでは履歴を保存できません'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(SCORE_STORE_NAME)) {
        database.createObjectStore(SCORE_STORE_NAME, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        const historyStore = database.createObjectStore(HISTORY_STORE_NAME, {
          keyPath: 'id',
        })
        historyStore.createIndex('openedAt', 'openedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('履歴データベースを開けませんでした'))
    request.onblocked = () =>
      reject(new Error('履歴データベースの更新がブロックされました'))
  })
}

const toHistoryItem = (score: CachedScore): ScoreHistoryItem => ({
  id: score.id,
  fileName: score.fileName,
  fileSize: score.fileSize,
  fileLastModified: score.fileLastModified,
  openedAt: score.openedAt,
  createdAt: score.createdAt,
  cacheVersion: score.cacheVersion,
  converterVersion: score.converterVersion,
})

export const createScoreId = async (binary: Uint8Array): Promise<string> => {
  const digestSource = binary.slice().buffer
  const digest = await crypto.subtle.digest('SHA-256', digestSource)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

export const isCompatibleCachedScore = (
  score: Pick<CachedScore, 'cacheVersion' | 'converterVersion'>
): boolean =>
  score.cacheVersion === SCORE_CACHE_VERSION &&
  score.converterVersion === SCORE_CONVERTER_VERSION

export const listRecentScores = async (): Promise<ScoreHistoryItem[]> => {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(HISTORY_STORE_NAME, 'readonly')
    const items = await requestToPromise(
      transaction.objectStore(HISTORY_STORE_NAME).getAll()
    )
    await transactionToPromise(transaction)
    return (items as ScoreHistoryItem[]).sort(
      (left, right) => right.openedAt - left.openedAt
    )
  } finally {
    database.close()
  }
}

export const getCachedScore = async (
  id: string
): Promise<CachedScore | null> => {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(SCORE_STORE_NAME, 'readonly')
    const score = await requestToPromise(
      transaction.objectStore(SCORE_STORE_NAME).get(id)
    )
    await transactionToPromise(transaction)
    return (score as CachedScore | undefined) ?? null
  } finally {
    database.close()
  }
}

export const saveCachedScore = async (score: CachedScore): Promise<void> => {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(
      [SCORE_STORE_NAME, HISTORY_STORE_NAME],
      'readwrite'
    )
    const scoreStore = transaction.objectStore(SCORE_STORE_NAME)
    const historyStore = transaction.objectStore(HISTORY_STORE_NAME)
    const existing = (await requestToPromise(scoreStore.get(score.id))) as
      | CachedScore
      | undefined
    const record = existing
      ? { ...score, createdAt: existing.createdAt }
      : score

    scoreStore.put(record)
    historyStore.put(toHistoryItem(record))

    const history = (await requestToPromise(
      historyStore.getAll()
    )) as ScoreHistoryItem[]
    history
      .sort((left, right) => right.openedAt - left.openedAt)
      .slice(HISTORY_LIMIT)
      .forEach((item) => {
        scoreStore.delete(item.id)
        historyStore.delete(item.id)
      })

    await transactionToPromise(transaction)
  } finally {
    database.close()
  }
}

export const touchCachedScore = async (id: string): Promise<void> => {
  const score = await getCachedScore(id)
  if (!score) throw new Error('履歴の楽譜が見つかりません')
  await saveCachedScore({ ...score, openedAt: Date.now() })
}

export const deleteCachedScore = async (id: string): Promise<void> => {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(
      [SCORE_STORE_NAME, HISTORY_STORE_NAME],
      'readwrite'
    )
    transaction.objectStore(SCORE_STORE_NAME).delete(id)
    transaction.objectStore(HISTORY_STORE_NAME).delete(id)
    await transactionToPromise(transaction)
  } finally {
    database.close()
  }
}

import { create } from 'zustand'

import type { AppErrorInfo } from '../lib/appError'

export interface ScoreState {
  // ファイル情報
  fileName: string | null
  fileBinary: Uint8Array | null

  // 解析状態
  isLoading: boolean
  error: AppErrorInfo | null

  // 結果
  musicXml: string | null
  musicMxl: Uint8Array | null

  totalDuration: number

  // 再生関連
  isPlaying: boolean
  currentTime: number
  tempoPercentage: number
  volume: number

  // ハイライト状態
  highlightedNoteTime: number | null

  // 解析 / 再生 アクション
  setFileBinary: (binary: Uint8Array, fileName: string) => void
  setConvertedScore: (score: {
    fileName: string
    fileBinary: Uint8Array | null
    musicXml: string
    musicMxl: Uint8Array | null
  }) => void
  setMusicXml: (xml: string) => void
  setMusicMxl: (mxl: Uint8Array | null) => void
  setLoading: (isLoading: boolean) => void
  setError: (error: AppErrorInfo | null) => void
  setTotalDuration: (duration: number) => void
  reset: () => void

  // 再生状態管理アクション
  setIsPlaying: (v: boolean) => void
  setCurrentTime: (t: number) => void
  setTempoPercentage: (percentage: number) => void
  setVolume: (v: number) => void
  setHighlightedNote: (time: number | null) => void
}

export const useScoreStore = create<ScoreState>((set) => ({
  fileName: null,
  fileBinary: null,
  isLoading: false,
  error: null,
  musicXml: null,
  musicMxl: null,

  totalDuration: 0,

  // player state
  isPlaying: false,
  currentTime: 0,
  tempoPercentage: 100,
  volume: 1,

  // highlight state
  highlightedNoteTime: null,

  setFileBinary: (binary, fileName) =>
    set({ fileBinary: binary, fileName, error: null }),

  setConvertedScore: ({ fileName, fileBinary, musicXml, musicMxl }) =>
    set({
      fileName,
      fileBinary,
      musicXml,
      musicMxl,
      isLoading: false,
      error: null,
      totalDuration: 0,
      isPlaying: false,
      currentTime: 0,
      highlightedNoteTime: null,
    }),

  setMusicXml: (xml) => set({ musicXml: xml }),

  setMusicMxl: (mxl) => set({ musicMxl: mxl }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setTotalDuration: (duration) => set({ totalDuration: duration }),

  reset: () =>
    set({
      fileName: null,
      fileBinary: null,
      isLoading: false,
      error: null,
      musicXml: null,
      musicMxl: null,
      totalDuration: 0,
      isPlaying: false,
      currentTime: 0,
      tempoPercentage: 100,
      volume: 1,
      highlightedNoteTime: null,
    }),

  // playback actions
  setIsPlaying: (v) =>
    set((state) => (state.isPlaying === v ? state : { isPlaying: v })),
  setCurrentTime: (t) =>
    set((state) => {
      if (Math.abs(state.currentTime - t) < 0.01) return state
      return { currentTime: t }
    }),
  setTempoPercentage: (percentage) =>
    set((state) =>
      state.tempoPercentage === percentage
        ? state
        : { tempoPercentage: percentage }
    ),
  setVolume: (v) =>
    set((state) => (state.volume === v ? state : { volume: v })),
  setHighlightedNote: (time) =>
    set((state) =>
      state.highlightedNoteTime === time ? state : { highlightedNoteTime: time }
    ),
}))

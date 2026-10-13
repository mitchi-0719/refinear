import { type FC, useEffect, useRef } from 'react'

import type {
  AudioMixerControls,
  AudioPlaybackControls,
} from '../../hooks/useAudioPlayer'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { useOnOffState } from '../../hooks/useOnOffState'
import { useScoreStore } from '../../stores/useScoreStore'
import { Icon } from '../ui/Icon'
import { MixerPanel, type ScoreVisibilityControls } from './MixerPanel'

type ControlModalProps = {
  play: () => void
  stop: () => void
  mixerControls: AudioMixerControls
  playbackControls: AudioPlaybackControls
  zoomIn: () => void
  zoomOut: () => void
  zoomPercentage: number
  isZoomRendering: boolean
  visibilityControls: ScoreVisibilityControls
  onHeightChange: (height: number) => void
}

export const ControlModal: FC<ControlModalProps> = ({
  play,
  stop,
  mixerControls,
  playbackControls,
  zoomIn,
  zoomOut,
  zoomPercentage,
  isZoomRendering,
  visibilityControls,
  onHeightChange,
}) => {
  const { state: isOpen, toggle: toggleDrawer } = useOnOffState(false)
  const modalRef = useRef<HTMLElement | null>(null)

  useBodyScrollLock(isOpen)

  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return

    const reportHeight = () => {
      onHeightChange(Math.ceil(modal.getBoundingClientRect().height))
    }
    const resizeObserver = new ResizeObserver(reportHeight)

    reportHeight()
    resizeObserver.observe(modal)

    return () => resizeObserver.disconnect()
  }, [onHeightChange])

  return (
    <aside
      ref={modalRef}
      className="fixed right-0 bottom-0 left-0 z-50 overscroll-contain rounded-t-2xl border border-slate-200 bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.12)] select-none"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] sm:px-5">
        <PlaybackPositionControl playbackControls={playbackControls} />
        <DrawerHeader
          isOpen={isOpen}
          toggleOpen={toggleDrawer}
          play={play}
          stop={stop}
          mixerControls={mixerControls}
          zoomIn={zoomIn}
          zoomOut={zoomOut}
          zoomPercentage={zoomPercentage}
          isZoomRendering={isZoomRendering}
        />
      </div>

      <div
        className={`grid bg-white transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          isOpen
            ? 'grid-rows-[1fr] border-t border-slate-200 opacity-100'
            : 'pointer-events-none grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-b border-slate-200 px-5">
            <span className="inline-block border-b-2 border-blue-600 px-3 py-0.5 text-xs font-bold text-blue-600">
              ミキサー
            </span>
          </div>
          <div className="overflow-x-auto overflow-y-hidden overscroll-contain px-4 py-3 pb-[max(14px,env(safe-area-inset-bottom))]">
            <MixerPanel
              mixerControls={mixerControls}
              visibilityControls={visibilityControls}
            />
          </div>
        </div>
      </div>
    </aside>
  )
}

const formatTime = (time: number) => {
  const wholeSeconds = Math.max(0, Math.floor(time))
  const minutes = Math.floor(wholeSeconds / 60)
  const seconds = wholeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const SEEK_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
])

const PlaybackPositionControl: FC<{
  playbackControls: AudioPlaybackControls
}> = ({ playbackControls }) => {
  const currentTime = useScoreStore((state) => state.currentTime)
  const totalDuration = useScoreStore((state) => state.totalDuration)
  const isSeekingRef = useRef(false)
  const pendingTimeRef = useRef(currentTime)
  const seekFrameRef = useRef<number | null>(null)

  const beginSeek = () => {
    if (isSeekingRef.current) return
    isSeekingRef.current = true
    pendingTimeRef.current = currentTime
    playbackControls.beginSeek()
  }

  const flushSeekPreview = () => {
    if (seekFrameRef.current !== null) {
      cancelAnimationFrame(seekFrameRef.current)
      seekFrameRef.current = null
    }
    playbackControls.previewSeek(pendingTimeRef.current)
  }

  const previewSeek = (time: number) => {
    beginSeek()
    pendingTimeRef.current = time
    if (seekFrameRef.current !== null) return

    seekFrameRef.current = requestAnimationFrame(() => {
      seekFrameRef.current = null
      playbackControls.previewSeek(pendingTimeRef.current)
    })
  }

  const commitSeek = () => {
    if (!isSeekingRef.current) return
    flushSeekPreview()
    isSeekingRef.current = false
    playbackControls.commitSeek()
  }

  useEffect(() => {
    return () => {
      if (seekFrameRef.current !== null) {
        cancelAnimationFrame(seekFrameRef.current)
      }
      playbackControls.cancelSeek()
    }
  }, [playbackControls])

  return (
    <div className="flex h-7 items-center gap-2 text-[11px] text-slate-600 tabular-nums sm:text-xs">
      <span className="w-9 shrink-0">{formatTime(currentTime)}</span>
      <input
        type="range"
        min={0}
        max={totalDuration || 1}
        step={0.1}
        value={currentTime}
        disabled={totalDuration === 0}
        className="player-range min-w-0 flex-1 disabled:opacity-40"
        aria-label="再生位置"
        onPointerDown={(event) => {
          beginSeek()
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onInput={(event) => previewSeek(Number(event.currentTarget.value))}
        onPointerUp={commitSeek}
        onPointerCancel={commitSeek}
        onLostPointerCapture={commitSeek}
        onKeyDown={(event) => {
          if (SEEK_KEYS.has(event.key)) beginSeek()
        }}
        onKeyUp={(event) => {
          if (SEEK_KEYS.has(event.key)) commitSeek()
        }}
        onBlur={commitSeek}
      />
      <span className="w-9 shrink-0 text-right">
        {formatTime(totalDuration)}
      </span>
    </div>
  )
}

type HeaderProps = {
  isOpen: boolean
  toggleOpen: () => void
  play: () => void
  stop: () => void
  mixerControls: AudioMixerControls
  zoomIn: () => void
  zoomOut: () => void
  zoomPercentage: number
  isZoomRendering: boolean
}

const DrawerHeader: FC<HeaderProps> = ({
  isOpen,
  toggleOpen,
  play,
  stop,
  mixerControls,
  zoomIn,
  zoomOut,
  zoomPercentage,
  isZoomRendering,
}) => {
  const isPlaying = useScoreStore((state) => state.isPlaying)
  const tempoPercentage = useScoreStore((state) => state.tempoPercentage)
  const setTempoPercentage = useScoreStore((state) => state.setTempoPercentage)
  const decreaseTempo = () =>
    setTempoPercentage(Math.max(25, tempoPercentage - 5))
  const increaseTempo = () =>
    setTempoPercentage(Math.min(200, tempoPercentage + 5))

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 py-1">
      <div className="flex items-end gap-1 justify-self-start">
        <button
          type="button"
          onClick={
            mixerControls.isMetronomeMuted
              ? mixerControls.unmuteMetronome
              : mixerControls.muteMetronome
          }
          className={`grid size-8 place-items-center rounded-lg border ${
            mixerControls.isMetronomeMuted
              ? 'border-slate-200 text-slate-400'
              : 'border-blue-200 bg-blue-50 text-blue-600'
          }`}
          aria-label={
            mixerControls.isMetronomeMuted
              ? 'メトロノームをオン'
              : 'メトロノームをオフ'
          }
        >
          <img
            src="/metronome.svg"
            alt=""
            aria-hidden="true"
            className="size-5"
          />
        </button>
        <CompactStepper
          label="テンポ"
          value={`x${tempoPercentage / 100}`}
          decrease={decreaseTempo}
          increase={increaseTempo}
          decreaseLabel="テンポを5%下げる"
          increaseLabel="テンポを5%上げる"
          decreaseDisabled={tempoPercentage <= 25}
          increaseDisabled={tempoPercentage >= 200}
        />
      </div>

      <button
        type="button"
        onClick={() => (isPlaying ? stop() : play())}
        className="grid size-10 place-items-center rounded-full bg-blue-600 text-white shadow-[0_5px_15px_rgba(37,99,235,0.28)] active:scale-95"
        aria-label={isPlaying ? '一時停止' : '再生'}
      >
        <Icon name={isPlaying ? 'pause' : 'play'} />
      </button>

      <div className="flex items-end gap-1 justify-self-end">
        <CompactStepper
          label="楽譜サイズ"
          value={`${zoomPercentage}%`}
          decrease={zoomOut}
          increase={zoomIn}
          isLoading={isZoomRendering}
          decreaseLabel="楽譜を縮小"
          increaseLabel="楽譜を拡大"
        />
        <button
          type="button"
          onClick={toggleOpen}
          className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-700"
          aria-label={isOpen ? 'ドロワーを閉じる' : 'ドロワーを開く'}
        >
          <Icon name={isOpen ? 'arrow-down' : 'arrow-up'} size="small" />
        </button>
      </div>
    </div>
  )
}

type CompactStepperProps = {
  label: string
  value: string
  decrease: () => void
  increase: () => void
  decreaseLabel: string
  increaseLabel: string
  isLoading?: boolean
  decreaseDisabled?: boolean
  increaseDisabled?: boolean
}

const CompactStepper = ({
  label,
  value,
  decrease,
  increase,
  decreaseLabel,
  increaseLabel,
  isLoading = false,
  decreaseDisabled = false,
  increaseDisabled = false,
}: CompactStepperProps) => (
  <div className="flex flex-col items-center gap-0.5">
    <span className="text-[9px] leading-none font-medium text-slate-400">
      {label}
    </span>
    <div className="flex items-center rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={decrease}
        disabled={decreaseDisabled}
        className="grid size-7 place-items-center text-slate-600 active:bg-slate-50 disabled:opacity-30"
        aria-label={decreaseLabel}
      >
        <Icon name="remove" size="small" />
      </button>
      <output className="grid w-10 place-items-center text-[11px] font-medium text-slate-700 tabular-nums">
        {isLoading ? (
          <span className="size-3 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
        ) : (
          value
        )}
      </output>
      <button
        type="button"
        onClick={increase}
        disabled={increaseDisabled}
        className="grid size-7 place-items-center text-slate-600 active:bg-slate-50 disabled:opacity-30"
        aria-label={increaseLabel}
      >
        <Icon name="add" size="small" />
      </button>
    </div>
  </div>
)

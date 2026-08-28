import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useShallow } from 'zustand/shallow'

import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { useNoteInteraction } from '../hooks/useNoteInteraction'
import { DEFAULT_SCORE_ZOOM, useOSMD } from '../hooks/useOSMD'
import { logger } from '../lib/logger'
import {
  type NoteEvent,
  type TempoChange,
  parseMusicXmlForEvents,
} from '../lib/musicXmlParser'
import {
  type PlaybackCursorAnchor,
  buildPlaybackCursorIndex,
  findNearestPlaybackCursorAnchor,
} from '../lib/playbackCursorIndex'
import type { SwingChange } from '../lib/swingPlayback'
import { useScoreStore } from '../stores/useScoreStore'
import { ControlModal } from './controlModal/ControlModal'
import type {
  ScorePartVisibilityControl,
  ScoreVisibilityControls,
} from './controlModal/MixerPanel'
import { Alert, AlertDescription, AlertTitle } from './ui/Alert'

const MIN_CURSOR_WIDTH_PX = 4
const SCORE_ZOOM_STEP_PERCENTAGE = 15
const MIN_SCORE_ZOOM_PERCENTAGE = 25
const MAX_SCORE_ZOOM_PERCENTAGE = 250
const EMPTY_NOTE_EVENTS: NoteEvent[] = []
const EMPTY_HIDDEN_PART_IDS = new Set<string>()
const OSMD_UNIT_IN_PIXELS = 10

type ParsedEventsState = {
  musicXml: string
  events: NoteEvent[]
  tempoChanges: TempoChange[]
  swingChanges: SwingChange[]
}

type MeasureAnchor = {
  measureIndex: number
  viewportOffset: number
}

const parseScoreParts = (musicXml: string | null) => {
  if (!musicXml) return []

  const doc = new DOMParser().parseFromString(musicXml, 'application/xml')
  return Array.from(doc.querySelectorAll('part-list > score-part')).flatMap(
    (scorePart, index) => {
      const id = scorePart.getAttribute('id')
      if (!id) return []

      return [
        {
          id,
          name:
            scorePart.querySelector('part-name')?.textContent?.trim() ||
            `パート ${index + 1}`,
        },
      ]
    }
  )
}

const syncCursorImageSize = (cursorElement?: HTMLImageElement | null) => {
  if (!cursorElement) return

  const width = cursorElement.getAttribute('width')
  const height = cursorElement.getAttribute('height')

  if (width) {
    const widthPx = Number(width)
    cursorElement.style.width = `${
      Number.isFinite(widthPx)
        ? Math.max(widthPx, MIN_CURSOR_WIDTH_PX)
        : MIN_CURSOR_WIDTH_PX
    }px`
  }
  if (height) {
    cursorElement.style.height = `${height}px`
  }

  cursorElement.style.maxWidth = 'none'
}

export const ScorePreview = () => {
  const playbackCursorIndexRef = useRef<PlaybackCursorAnchor[]>([])
  const lastCursorEventTimeRef = useRef<number | null>(null)
  const lastCursorTopRef = useRef<string | null>(null)
  const scoreZoomPercentageRef = useRef(100)
  const zoomRenderFrameRef = useRef<number | null>(null)
  const [scoreZoomPercentage, setScoreZoomPercentage] = useState(100)
  const [isZoomRendering, setIsZoomRendering] = useState(false)
  const [controlModalHeight, setControlModalHeight] = useState(0)
  const [isPartVisibilityRendering, setIsPartVisibilityRendering] =
    useState(false)
  const [partVisibilityState, setPartVisibilityState] = useState<{
    musicXml: string | null
    hiddenPartIds: Set<string>
  }>({ musicXml: null, hiddenPartIds: EMPTY_HIDDEN_PART_IDS })
  const [visibilityErrorState, setVisibilityErrorState] = useState<{
    musicXml: string | null
    message: string | null
  }>({ musicXml: null, message: null })
  const { musicXml, musicMxl, isLoading } = useScoreStore(
    useShallow((state) => ({
      musicXml: state.musicXml,
      musicMxl: state.musicMxl,
      isLoading: state.isLoading,
    }))
  )

  const {
    containerRef,
    renderError,
    isRendering,
    osmdRef,
    renderRevision,
    notifyRendered,
  } = useOSMD(
    musicXml,
    musicMxl,
    (DEFAULT_SCORE_ZOOM * scoreZoomPercentage) / 100
  )
  const scoreParts = useMemo(() => parseScoreParts(musicXml), [musicXml])
  const hiddenPartIds =
    partVisibilityState.musicXml === musicXml
      ? partVisibilityState.hiddenPartIds
      : EMPTY_HIDDEN_PART_IDS
  const visibilityError =
    visibilityErrorState.musicXml === musicXml
      ? visibilityErrorState.message
      : null

  const getMeasureTop = useCallback(
    (measureIndex: number) => {
      const measures = osmdRef.current?.GraphicSheet?.MeasureList[measureIndex]
      if (!measures) return null

      // OSMDのMeasureListは型上GraphicalMeasure[]だが、実行時には
      // 非表示譜表の位置がundefinedになった疎配列を返すことがある。
      const visibleMeasure = measures.find((measure) => measure?.isVisible())
      if (!visibleMeasure) return null

      return (
        visibleMeasure.PositionAndShape.AbsolutePosition.y *
        OSMD_UNIT_IN_PIXELS *
        (osmdRef.current?.zoom ?? DEFAULT_SCORE_ZOOM)
      )
    },
    [osmdRef]
  )

  const captureMeasureAnchor = useCallback(() => {
    const container = containerRef.current
    const measureList = osmdRef.current?.GraphicSheet?.MeasureList
    if (!container || !measureList?.length) return null

    const containerTop = container.getBoundingClientRect().top + window.scrollY
    const viewportTopInScore = Math.max(0, window.scrollY - containerTop)
    let anchorIndex = 0

    for (let index = 0; index < measureList.length; index += 1) {
      const top = getMeasureTop(index)
      if (top === null || top > viewportTopInScore) break
      anchorIndex = index
    }

    const measureTop = getMeasureTop(anchorIndex)
    if (measureTop === null) return null

    return {
      measureIndex: anchorIndex,
      viewportOffset: containerTop + measureTop - window.scrollY,
    }
  }, [containerRef, getMeasureTop, osmdRef])

  const restoreMeasureAnchor = useCallback(
    (anchor: MeasureAnchor | null) => {
      const container = containerRef.current
      if (!anchor || !container) return

      const measureTop = getMeasureTop(anchor.measureIndex)
      if (measureTop === null) return

      const containerTop =
        container.getBoundingClientRect().top + window.scrollY
      window.scrollTo({
        top: Math.max(0, containerTop + measureTop - anchor.viewportOffset),
        behavior: 'auto',
      })
    },
    [containerRef, getMeasureTop]
  )

  const applyPartVisibility = useCallback(
    (nextHiddenPartIds: Set<string>) => {
      const osmd = osmdRef.current
      if (!osmd || isPartVisibilityRendering) return

      const previousHiddenPartIds = hiddenPartIds
      const anchor = captureMeasureAnchor()
      setIsPartVisibilityRendering(true)
      setVisibilityErrorState({ musicXml, message: null })

      // ローディング表示を先にブラウザへ描画してから、重いOSMD更新を行う。
      // 楽譜サイズ変更と同様に2フレーム待つことで、クリック直後に
      // フィードバックが見えないままメインスレッドが塞がるのを防ぐ。
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            osmd.Sheet.Instruments.forEach((instrument) => {
              instrument.Visible = !nextHiddenPartIds.has(instrument.IdString)
            })
            osmd.updateGraphic()
            osmd.render()
            notifyRendered()
            setPartVisibilityState({
              musicXml,
              hiddenPartIds: nextHiddenPartIds,
            })
          } catch (error) {
            logger.error('[ScorePreview] Part visibility render failed:', error)
            osmd.Sheet.Instruments.forEach((instrument) => {
              instrument.Visible = !previousHiddenPartIds.has(
                instrument.IdString
              )
            })
            try {
              osmd.updateGraphic()
              osmd.render()
              notifyRendered()
            } catch (rollbackError) {
              logger.error(
                '[ScorePreview] Part visibility rollback failed:',
                rollbackError
              )
            }
            setVisibilityErrorState({
              musicXml,
              message: 'パート表示を変更できませんでした',
            })
          }

          // 再描画結果とスクロール補正が反映されるフレームまで表示を保つ。
          requestAnimationFrame(() => {
            restoreMeasureAnchor(anchor)
            setIsPartVisibilityRendering(false)
          })
        })
      })
    },
    [
      captureMeasureAnchor,
      hiddenPartIds,
      isPartVisibilityRendering,
      musicXml,
      notifyRendered,
      osmdRef,
      restoreMeasureAnchor,
    ]
  )

  const visibilityControls = useMemo<ScoreVisibilityControls>(() => {
    const parts: ScorePartVisibilityControl[] = scoreParts.map((part) => ({
      ...part,
      isVisible: !hiddenPartIds.has(part.id),
    }))

    return {
      parts,
      isRendering: isPartVisibilityRendering,
      togglePart: (partId) => {
        const nextHiddenPartIds = new Set(hiddenPartIds)
        if (nextHiddenPartIds.has(partId)) {
          nextHiddenPartIds.delete(partId)
        } else if (scoreParts.length - nextHiddenPartIds.size > 1) {
          nextHiddenPartIds.add(partId)
        }
        applyPartVisibility(nextHiddenPartIds)
      },
      showAllParts: () => applyPartVisibility(new Set()),
    }
  }, [
    applyPartVisibility,
    hiddenPartIds,
    isPartVisibilityRendering,
    scoreParts,
  ])

  useEffect(() => {
    return () => {
      if (zoomRenderFrameRef.current !== null) {
        cancelAnimationFrame(zoomRenderFrameRef.current)
      }
    }
  }, [])

  const [parsedEventsState, setParsedEventsState] =
    useState<ParsedEventsState | null>(null)
  const parsedEvents =
    musicXml && parsedEventsState?.musicXml === musicXml
      ? parsedEventsState.events
      : EMPTY_NOTE_EVENTS
  const tempoChanges =
    musicXml && parsedEventsState?.musicXml === musicXml
      ? parsedEventsState.tempoChanges
      : []
  const swingChanges =
    musicXml && parsedEventsState?.musicXml === musicXml
      ? parsedEventsState.swingChanges
      : []

  useEffect(() => {
    if (!musicXml) return

    let cancelled = false
    void parseMusicXmlForEvents(musicXml)
      .then(
        ({
          events,
          tempoChanges: parsedTempoChanges,
          swingChanges: parsedSwingChanges,
        }) => {
          if (!cancelled) {
            setParsedEventsState({
              musicXml,
              events,
              tempoChanges: parsedTempoChanges,
              swingChanges: parsedSwingChanges,
            })
          }
        }
      )
      .catch((error: unknown) => {
        logger.error('MusicXML event parsing failed:', error)
        if (!cancelled) {
          setParsedEventsState({
            musicXml,
            events: EMPTY_NOTE_EVENTS,
            tempoChanges: [],
            swingChanges: [],
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [musicXml])

  const followPlaybackCursor = useCallback(
    (cursorElement?: HTMLImageElement | null) => {
      if (!cursorElement) return

      const cursorTop = cursorElement.style.top
      if (!cursorTop || cursorTop === lastCursorTopRef.current) return

      lastCursorTopRef.current = cursorTop
      const headerHeight =
        document.querySelector<HTMLElement>('[data-app-header]')
          ?.offsetHeight ?? 0
      cursorElement.style.scrollMarginTop = `${headerHeight + 60}px`
      cursorElement.scrollIntoView({
        block: 'start',
        inline: 'nearest',
        behavior: 'auto',
      })
    },
    []
  )

  const syncPlaybackCursor = useCallback(
    (eventTime: number) => {
      const cursor = osmdRef.current?.cursor
      if (!cursor) return

      const targetTicks = Math.max(0, Math.round(eventTime))
      const anchor = findNearestPlaybackCursorAnchor(
        playbackCursorIndexRef.current,
        targetTicks
      )
      if (!anchor) {
        if (targetTicks !== 0) return
        cursor.reset()
        cursor.show()
        syncCursorImageSize(cursor.cursorElement)
        followPlaybackCursor(cursor.cursorElement)
        lastCursorEventTimeRef.current = 0
        return
      }
      if (lastCursorEventTimeRef.current === anchor.ticks) return

      cursor.show()
      cursor.updateWidthAndStyle(
        anchor.measurePositionAndShape,
        anchor.x,
        anchor.y,
        anchor.height
      )
      syncCursorImageSize(cursor.cursorElement)
      followPlaybackCursor(cursor.cursorElement)
      lastCursorEventTimeRef.current = anchor.ticks
    },
    [followPlaybackCursor, osmdRef]
  )

  const resolveSeekTicks = useCallback((ticks: number) => {
    return (
      findNearestPlaybackCursorAnchor(playbackCursorIndexRef.current, ticks)
        ?.ticks ?? ticks
    )
  }, [])

  useEffect(() => {
    const osmd = osmdRef.current
    if (!osmd) {
      playbackCursorIndexRef.current = []
      return
    }

    const currentCursorTicks = lastCursorEventTimeRef.current
    playbackCursorIndexRef.current = buildPlaybackCursorIndex(osmd)
    lastCursorEventTimeRef.current = null
    lastCursorTopRef.current = null

    if (currentCursorTicks !== null) {
      syncPlaybackCursor(currentCursorTicks)
    }
  }, [musicXml, osmdRef, renderRevision, syncPlaybackCursor])

  const startPlaybackCursor = useCallback(
    (startTicks: number) => {
      const cursor = osmdRef.current?.cursor
      if (!cursor) return

      lastCursorEventTimeRef.current = null
      lastCursorTopRef.current = null

      if (startTicks > 0) {
        syncPlaybackCursor(startTicks)
        return
      }

      cursor.reset()
      cursor.show()
      syncCursorImageSize(cursor.cursorElement)
      followPlaybackCursor(cursor.cursorElement)
    },
    [followPlaybackCursor, osmdRef, syncPlaybackCursor]
  )

  const { play, stop, playNote, mixerControls, playbackControls } =
    useAudioPlayer(parsedEvents, {
      tempoChanges,
      swingChanges,
      onNoteStart: (event) => syncPlaybackCursor(event.time),
      onPlaybackStart: startPlaybackCursor,
      onPlaybackStop: () => {
        lastCursorEventTimeRef.current = null
        lastCursorTopRef.current = null
        osmdRef.current?.cursor?.hide()
      },
      onSeek: syncPlaybackCursor,
      resolveSeekTicks,
    })

  const { handlePointerDown, handlePointerUp } = useNoteInteraction(
    containerRef,
    osmdRef,
    parsedEvents,
    playNote
  )

  const changeScoreZoom = useCallback(
    (delta: number) => {
      const nextZoomPercentage = Math.min(
        MAX_SCORE_ZOOM_PERCENTAGE,
        Math.max(
          MIN_SCORE_ZOOM_PERCENTAGE,
          scoreZoomPercentageRef.current + delta
        )
      )
      if (nextZoomPercentage === scoreZoomPercentageRef.current) return

      scoreZoomPercentageRef.current = nextZoomPercentage
      setScoreZoomPercentage(nextZoomPercentage)
      setIsZoomRendering(true)

      // まず数値を描画し、その次のフレームで楽譜を更新する。
      if (zoomRenderFrameRef.current !== null) return

      zoomRenderFrameRef.current = requestAnimationFrame(() => {
        zoomRenderFrameRef.current = requestAnimationFrame(() => {
          zoomRenderFrameRef.current = null

          const osmd = osmdRef.current
          if (!osmd) {
            setIsZoomRendering(false)
            return
          }

          try {
            osmd.zoom =
              (DEFAULT_SCORE_ZOOM * scoreZoomPercentageRef.current) / 100
            osmd.render()
            notifyRendered()
          } finally {
            setIsZoomRendering(false)
          }
        })
      })
    },
    [notifyRendered, osmdRef]
  )

  const zoomIn = useCallback(
    () => changeScoreZoom(SCORE_ZOOM_STEP_PERCENTAGE),
    [changeScoreZoom]
  )
  const zoomOut = useCallback(
    () => changeScoreZoom(-SCORE_ZOOM_STEP_PERCENTAGE),
    [changeScoreZoom]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let overlay: HTMLDivElement | null = null
    let wasPlaying = useScoreStore.getState().isPlaying
    const addOverlay = () => {
      if (overlay || !container) return
      overlay = document.createElement('div')
      overlay.style.position = 'absolute'
      overlay.style.inset = '0'
      overlay.style.zIndex = '10'
      overlay.style.touchAction = 'manipulation'
      container.appendChild(overlay)
    }
    const removeOverlay = () => {
      if (!overlay) return
      overlay.remove()
      overlay = null
    }
    if (wasPlaying) addOverlay()
    const unsubscribe = useScoreStore.subscribe((state) => {
      if (state.isPlaying === wasPlaying) return
      wasPlaying = state.isPlaying
      if (state.isPlaying) {
        addOverlay()
      } else {
        removeOverlay()
      }
    })
    return () => {
      unsubscribe()
      removeOverlay()
    }
  }, [containerRef])

  const isLoadingScore = Boolean((isLoading || isRendering) && !musicXml)

  return (
    <section className="w-full">
      {renderError ? (
        <Alert variant="error">
          <AlertTitle>エラー</AlertTitle>
          <AlertDescription>{renderError}</AlertDescription>
        </Alert>
      ) : (
        <div className="relative overflow-x-auto rounded-lg bg-white">
          <div
            ref={containerRef}
            className="score-preview relative w-full bg-white"
            style={{
              touchAction: 'manipulation',
              willChange: 'transform',
              transform: 'translate3d(0, 0, 0)',
            }}
            role="img"
            aria-label="楽譜表示エリア"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
          />
          {isLoadingScore && (
            <Alert variant="info">
              <AlertTitle>処理中...</AlertTitle>
              <AlertDescription>
                楽譜ファイルを読み込んで MusicXML に変換しています
              </AlertDescription>
            </Alert>
          )}
          {visibilityError && (
            <Alert variant="error">
              <AlertTitle>エラー</AlertTitle>
              <AlertDescription>{visibilityError}</AlertDescription>
            </Alert>
          )}
          {(isRendering || isZoomRendering || isPartVisibilityRendering) && (
            <div
              className="fixed inset-0 z-40 grid place-items-center bg-white/65 backdrop-blur-[1px]"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-bold text-[#071b47] shadow-xl">
                <span
                  className="size-5 animate-spin rounded-full border-2 border-blue-100 border-t-blue-600"
                  aria-hidden="true"
                />
                楽譜を描画しています
              </div>
            </div>
          )}
          <div
            aria-hidden="true"
            style={{ height: `${controlModalHeight}px` }}
          />
          <ControlModal
            play={play}
            stop={stop}
            mixerControls={mixerControls}
            playbackControls={playbackControls}
            zoomIn={zoomIn}
            zoomOut={zoomOut}
            zoomPercentage={scoreZoomPercentage}
            isZoomRendering={isZoomRendering}
            visibilityControls={visibilityControls}
            onHeightChange={setControlModalHeight}
          />
        </div>
      )}
    </section>
  )
}

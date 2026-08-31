import { useCallback, useEffect, useRef, useState } from 'react'

import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'

import { logger } from '../lib/logger'
import { waitFrame } from '../lib/waitFrame'

// 楽譜を初回表示する際の拡大率。必要に応じてここを調整する。
export const DEFAULT_SCORE_ZOOM = 0.35

export const useOSMD = (
  musicXml: string | null,
  musicMxl: Uint8Array | null = null,
  zoom = DEFAULT_SCORE_ZOOM
) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [renderRevision, setRenderRevision] = useState(0)
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null)
  const isLoadedRef = useRef(false)
  const zoomRef = useRef(zoom)

  const notifyRendered = useCallback(() => {
    setRenderRevision((revision) => revision + 1)
  }, [])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    let lastWidth = window.innerWidth
    let resizeTimeoutId: ReturnType<typeof setTimeout> | null = null

    const handleWindowResize = () => {
      const currentWidth = window.innerWidth

      // 幅が変化した場合のみ処理を実行
      if (currentWidth !== lastWidth) {
        lastWidth = currentWidth

        if (resizeTimeoutId) {
          clearTimeout(resizeTimeoutId)
        }

        resizeTimeoutId = setTimeout(() => {
          if (osmdRef.current && isLoadedRef.current) {
            try {
              osmdRef.current.render()
              notifyRendered()
            } catch (err) {
              logger.error('[useOSMD] Manual resize render error:', err)
            }
          }
        }, 300)
      }
    }

    window.addEventListener('resize', handleWindowResize)
    return () => {
      window.removeEventListener('resize', handleWindowResize)
      if (resizeTimeoutId) {
        clearTimeout(resizeTimeoutId)
      }
    }
  }, [notifyRendered])

  useEffect(() => {
    const container = containerRef.current
    if ((!musicXml && !musicMxl) || !container) {
      setIsRendering(false)
      return
    }

    let isCancelled = false

    const setup = async () => {
      try {
        setRenderError(null)
        setIsRendering(true)

        await waitFrame()
        await waitFrame()

        if (isCancelled || !container) {
          return
        }

        const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay')
        if (isCancelled) return

        const createOsmd = () =>
          new OpenSheetMusicDisplay(container, {
            autoResize: false, // 画面サイズ変更時の自動リサイズをオフ（幅変更のみ自前で制御するため）
            backend: 'svg', // デモと同じくっきりしたSVG描画
            drawTitle: true, // タイトルを描画する
            drawSubtitle: true, // サブタイトルを描画する
            drawingParameters: 'default', // デモ標準の美しいレイアウト
            disableCursor: false, // 必須：Tone.jsと同期する縦棒（カーソル）を使うため
          })
        const loadMxl = async (osmd: OpenSheetMusicDisplay) => {
          if (!musicMxl) throw new Error('MXL data is not available')
          const arrayBuffer = new Uint8Array(musicMxl).buffer
          await osmd.load(
            new Blob([arrayBuffer], {
              type: 'application/vnd.recordare.musicxml+xml',
            })
          )
        }

        let osmd = createOsmd()
        osmdRef.current = osmd
        isLoadedRef.current = false

        if (musicXml) {
          try {
            await osmd.load(musicXml)
          } catch (xmlError) {
            if (!musicMxl || isCancelled) throw xmlError

            logger.warn(
              '[useOSMD] MusicXML load failed; retrying with MXL',
              xmlError
            )
            osmd.clear()
            container.innerHTML = ''
            osmd = createOsmd()
            osmdRef.current = osmd
            await loadMxl(osmd)
          }
        } else if (musicMxl) {
          await loadMxl(osmd)
        } else return

        if (isCancelled) {
          osmd.clear()
          return
        }

        isLoadedRef.current = true

        // 描画準備中に変更された倍率も、初回描画に反映する。
        osmd.zoom = zoomRef.current

        if (!isCancelled) {
          osmd.render()
          notifyRendered()
          setIsRendering(false)
        }
      } catch (err) {
        if (!isCancelled) {
          logger.error('OSMD Render Error:', err)
          isLoadedRef.current = false
          osmdRef.current?.clear()
          osmdRef.current = null
          container.innerHTML = ''
          setRenderError('楽譜の描画中にエラーが発生しました')
          setIsRendering(false)
        }
      }
    }

    setup()

    return () => {
      isCancelled = true
      isLoadedRef.current = false
      if (osmdRef.current) {
        osmdRef.current.clear()
        osmdRef.current = null
      }
      if (container) {
        container.innerHTML = ''
      }
    }
  }, [musicXml, musicMxl, notifyRendered])

  return {
    containerRef,
    renderError,
    isRendering,
    osmdRef,
    renderRevision,
    notifyRendered,
  }
}

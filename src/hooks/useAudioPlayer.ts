import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type * as ToneModule from 'tone'

import { DRUM_MAP, MIDI_UNPITCHED_TO_KEY } from '../constants/drum'
import { PIANO_MAP } from '../constants/piano'
import { configurePlaybackAudioSession } from '../lib/audioSession'
import { logger } from '../lib/logger'
import type { NoteEvent, SamplerId, TempoChange } from '../lib/musicXmlParser'
import { type SwingChange, getSwingPlaybackTiming } from '../lib/swingPlayback'
import { useScoreStore } from '../stores/useScoreStore'

type AudioPlayerOptions = {
  tempoChanges?: TempoChange[]
  swingChanges?: SwingChange[]
  onNoteStart?: (event: NoteEvent) => void
  onPlaybackStart?: (startTicks: number) => void
  onPlaybackStop?: () => void
  onSeek?: (ticks: number) => void
  resolveSeekTicks?: (ticks: number) => number
}

export type AudioPlaybackControls = {
  beginSeek: () => void
  previewSeek: (time: number) => void
  commitSeek: () => void
  cancelSeek: () => void
}

export type AudioPartControl = {
  id: string
  name: string
  volume: number
  isMuted: boolean
  isSoloed: boolean
}

export type AudioMixerControls = {
  parts: AudioPartControl[]
  masterVolume: number
  metronomeVolume: number
  isMetronomeMuted: boolean
  isMetronomeSoloed: boolean
  soloPart: (partId: string) => void
  clearSoloPart: () => void
  mutePart: (partId: string) => void
  unmutePart: (partId: string) => void
  setPartVolume: (partId: string, volume: number) => void
  muteAll: () => void
  unmuteAll: () => void
  setMasterVolume: (volume: number) => void
  setMetronomeVolume: (volume: number) => void
  muteMetronome: () => void
  unmuteMetronome: () => void
  soloMetronome: () => void
  clearMetronomeSolo: () => void
}

type PartMixerState = {
  volume: number
  isMuted: boolean
}

type MixerState = {
  masterVolume: number
  metronomeVolume: number
  soloPartId: string | null
  metronomeMuted: boolean
  metronomeSoloed: boolean
  parts: Record<string, PartMixerState>
}

type SamplerConfig = {
  urls: Record<string, string>
  baseUrl: string
}

let _toneModule: typeof ToneModule | null = null
let _toneModulePromise: Promise<typeof ToneModule> | null = null
const getTone = async (): Promise<typeof ToneModule> => {
  if (_toneModule) return _toneModule

  if (!_toneModulePromise) {
    _toneModulePromise = import('tone')
      .then((module) => {
        _toneModule = module
        return module
      })
      .catch((error: unknown) => {
        _toneModulePromise = null
        throw error
      })
  }

  return _toneModulePromise
}

const SAMPLER_CONFIGS: Record<SamplerId, SamplerConfig> = {
  piano: { urls: PIANO_MAP, baseUrl: '/sounds/piano/' },
  drum: { urls: DRUM_MAP, baseUrl: '/sounds/drums/' },
  clap: { urls: { C4: 'Clap.wav' }, baseUrl: '/sounds/clap/' },
}
const EMPTY_SAMPLER_CONFIGS: Partial<Record<SamplerId, SamplerConfig>> = {}
let _pianoSampleKeyByMidi: Map<number, string> | null = null
const getPianoSampleKeyByMidi = (
  Tone: typeof ToneModule
): Map<number, string> => {
  if (!_pianoSampleKeyByMidi) {
    _pianoSampleKeyByMidi = new Map(
      Object.keys(PIANO_MAP).map((key) => [Tone.Frequency(key).toMidi(), key])
    )
  }
  return _pianoSampleKeyByMidi
}
const DEFAULT_VOLUME = 1
const MAX_VOLUME = 2
const TICKS_PER_QUARTER = 192
const DEFAULT_MEASURE_TICKS = TICKS_PER_QUARTER * 4
const METRONOME_ACCENT_NOTE = 'C6'
const METRONOME_BEAT_NOTE = 'C5'
const METRONOME_BEAT_VOLUME_MULTIPLIER = 0.7
const MAX_PART_BOOST_DB = 12
const MAX_MASTER_BOOST_DB = 6
const MASTER_LIMITER_THRESHOLD_DB = -1
const VOLUME_RAMP_SECONDS = 0.03
// グリッサンドの中間音はサンプルの余韻を重ねず、次の音までに完全停止する。
const GLISSANDO_RELEASE_SECONDS = 0.005
const GLISSANDO_VOLUME_MULTIPLIER = 1.25
// MuseScore と同様、開始音を保持してグリッサンド本体を末尾約1/3へ寄せる。
const GLISSANDO_PORTION = 0.33
// ミキサーの表示値は維持したまま、ドラム音源の出力だけを少し抑える。
const DRUM_VOLUME_MULTIPLIER = 0.5
// 高密度な連打で音圧が上がりすぎないよう、ロール時の各打音だけを抑える。
const DRUM_ROLL_VOLUME_MULTIPLIER = 0.2
const REFERENCE_DYNAMIC_VELOCITY = 80
const DYNAMIC_GAIN_EXPONENT = 2

const ticksToScoreSeconds = (ticks: number, tempoChanges: TempoChange[]) => {
  const changes = tempoChanges.length ? tempoChanges : [{ time: 0, bpm: 120 }]
  let seconds = 0
  let previousTicks = 0
  let bpm = changes[0]?.bpm ?? 120

  for (const change of changes) {
    if (change.time <= previousTicks) {
      bpm = change.bpm
      continue
    }
    if (change.time >= ticks) break
    seconds += ((change.time - previousTicks) / TICKS_PER_QUARTER) * (60 / bpm)
    previousTicks = change.time
    bpm = change.bpm
  }

  return (
    seconds +
    (Math.max(0, ticks - previousTicks) / TICKS_PER_QUARTER) * (60 / bpm)
  )
}

const scoreSecondsToTicks = (seconds: number, tempoChanges: TempoChange[]) => {
  const changes = tempoChanges.length ? tempoChanges : [{ time: 0, bpm: 120 }]
  let remainingSeconds = Math.max(0, seconds)
  let previousTicks = 0
  let bpm = changes[0]?.bpm ?? 120

  for (const change of changes) {
    if (change.time <= previousTicks) {
      bpm = change.bpm
      continue
    }
    const segmentSeconds =
      ((change.time - previousTicks) / TICKS_PER_QUARTER) * (60 / bpm)
    if (remainingSeconds <= segmentSeconds) {
      return previousTicks + (remainingSeconds * bpm * TICKS_PER_QUARTER) / 60
    }
    remainingSeconds -= segmentSeconds
    previousTicks = change.time
    bpm = change.bpm
  }

  return previousTicks + (remainingSeconds * bpm * TICKS_PER_QUARTER) / 60
}
const clampVolume = (volume: number) =>
  Math.min(MAX_VOLUME, Math.max(0, volume))
const mixerValueToDecibels = (volume: number, maxBoostDb: number) => {
  const Tone = _toneModule!
  const clampedVolume = clampVolume(volume)

  if (clampedVolume === 0) return -Infinity
  if (clampedVolume <= DEFAULT_VOLUME) {
    return Tone.gainToDb(clampedVolume)
  }

  return (clampedVolume - DEFAULT_VOLUME) * maxBoostDb
}
const getSamplerVolumeMultiplier = (samplerId: string) =>
  samplerId === 'drum' ? DRUM_VOLUME_MULTIPLIER : 1
// mf (velocity 80) をミキサーで指定した音量そのものとして扱い、
// 強弱はその基準に対する相対ゲインにする。サンプル音源でも差が聴き取れるよう、
// MIDI velocity の比率を二乗してダイナミックレンジを広げる。
const getDynamicGain = (velocity: number) =>
  Math.pow(velocity / REFERENCE_DYNAMIC_VELOCITY, DYNAMIC_GAIN_EXPONENT)
const getDefaultPartState = (): PartMixerState => ({
  volume: DEFAULT_VOLUME,
  isMuted: false,
})
const getClosestPianoSampleKey = (
  midi: number,
  pianoKeyMap: Map<number, string>
) => {
  for (let interval = 0; interval < 96; interval += 1) {
    const upperKey = pianoKeyMap.get(midi + interval)
    if (upperKey) return upperKey

    const lowerKey = pianoKeyMap.get(midi - interval)
    if (lowerKey) return lowerKey
  }

  return 'C4'
}
const getGlissandoPlaybackKey = (
  samplerId: SamplerId,
  midi: number,
  Tone: typeof ToneModule
) => {
  if (samplerId === 'clap') return 'C4'
  if (samplerId === 'drum') return MIDI_UNPITCHED_TO_KEY[midi] ?? null
  return Tone.Frequency(midi, 'midi').toNote()
}
const getRequiredSamplerConfigs = (
  parsedEvents: NoteEvent[],
  Tone: typeof ToneModule
): Partial<Record<SamplerId, SamplerConfig>> => {
  const pianoKeyMap = getPianoSampleKeyByMidi(Tone)
  const requiredKeys: Record<SamplerId, Set<string>> = {
    piano: new Set(),
    drum: new Set(),
    clap: new Set(),
  }

  parsedEvents.forEach((event) => {
    if (event.isRest) return

    if (
      event.glissandoTargetMidi !== null &&
      event.glissandoTargetMidi !== event.midi
    ) {
      const direction = event.glissandoTargetMidi > event.midi ? 1 : -1
      for (
        let midi = event.midi;
        midi !== event.glissandoTargetMidi;
        midi += direction
      ) {
        const playbackKey = getGlissandoPlaybackKey(event.samplerId, midi, Tone)
        if (playbackKey) requiredKeys[event.samplerId].add(playbackKey)
      }
    }

    if (event.samplerId === 'piano') {
      requiredKeys.piano.add(
        getClosestPianoSampleKey(
          Tone.Frequency(event.playbackKey).toMidi(),
          pianoKeyMap
        )
      )
      return
    }

    requiredKeys[event.samplerId].add(event.playbackKey)
  })

  return Object.fromEntries(
    (Object.keys(requiredKeys) as SamplerId[]).flatMap((samplerId) => {
      const keys = requiredKeys[samplerId]
      if (keys.size === 0) return []

      const config = SAMPLER_CONFIGS[samplerId]
      const urls = Object.fromEntries(
        Array.from(keys, (key) => [key, config.urls[key]]).filter(
          (entry): entry is [string, string] => Boolean(entry[1])
        )
      )

      return Object.keys(urls).length > 0
        ? [[samplerId, { urls, baseUrl: config.baseUrl }]]
        : []
    })
  )
}
const createSamplerFromSharedBuffers = (
  buffers: ToneModule.ToneAudioBuffers,
  sampleKeys: string[],
  release?: number
) => {
  const Tone = _toneModule!
  const urls = Object.fromEntries(
    sampleKeys.map((key) => [key, buffers.get(key)])
  )

  if (release === undefined) {
    return new Tone.Sampler({ urls })
  }

  return new Tone.Sampler({
    urls,
    release,
  })
}

export const useAudioPlayer = (
  parsedEvents: NoteEvent[],
  options: AudioPlayerOptions = {}
) => {
  const samplers = useRef<Record<string, ToneModule.Sampler>>({})
  const sharedSampleBuffersRef = useRef<
    Partial<Record<SamplerId, ToneModule.ToneAudioBuffers>>
  >({})
  const partSamplersRef = useRef<Record<string, ToneModule.Sampler>>({})
  const glissandoPartSamplersRef = useRef<Record<string, ToneModule.Sampler>>(
    {}
  )
  const activeGlissandoSourcesRef = useRef<Set<ToneModule.ToneBufferSource>>(
    new Set()
  )
  const partChannelsRef = useRef<Record<string, ToneModule.Channel>>({})
  const masterChannelRef = useRef<ToneModule.Channel | null>(null)
  const masterLimiterRef = useRef<ToneModule.Limiter | null>(null)
  const metronomeSynthRef = useRef<ToneModule.Synth | null>(null)
  const metronomeChannelRef = useRef<ToneModule.Channel | null>(null)
  const metronomeLoopRef = useRef<ToneModule.Loop | null>(null)
  const isPlaying = useScoreStore((state) => state.isPlaying)
  const tempoPercentage = useScoreStore((state) => state.tempoPercentage)
  const highlightedNoteTime = useScoreStore(
    (state) => state.highlightedNoteTime
  )
  const setIsPlaying = useScoreStore((state) => state.setIsPlaying)
  const setCurrentTime = useScoreStore((state) => state.setCurrentTime)
  const setTotalDuration = useScoreStore((state) => state.setTotalDuration)
  const setHighlightedNote = useScoreStore((state) => state.setHighlightedNote)
  const setStoreVolume = useScoreStore((state) => state.setVolume)
  const partRef = useRef<ToneModule.Part | null>(null)
  const tempoScheduleIdsRef = useRef<number[]>([])
  const tempoMultiplierRef = useRef(tempoPercentage / 100)
  const playbackPositionTicksRef = useRef(highlightedNoteTime ?? 0)
  const onNoteStartRef = useRef(options.onNoteStart)
  const onPlaybackStartRef = useRef(options.onPlaybackStart)
  const onPlaybackStopRef = useRef(options.onPlaybackStop)
  const onSeekRef = useRef(options.onSeek)
  const resolveSeekTicksRef = useRef(options.resolveSeekTicks)
  const isSeekingRef = useRef(false)
  const resumeAfterSeekRef = useRef(false)
  const hasObservedPlaybackStateRef = useRef(false)
  const activePartIdsRef = useRef<Set<string>>(new Set())
  const measureStartTicksRef = useRef<Set<number>>(new Set())
  const [loadedSamplerConfigs, setLoadedSamplerConfigs] = useState<Partial<
    Record<SamplerId, SamplerConfig>
  > | null>(null)
  const [mixerState, setMixerState] = useState<MixerState>({
    masterVolume: DEFAULT_VOLUME,
    metronomeVolume: DEFAULT_VOLUME,
    soloPartId: null,
    metronomeMuted: false,
    metronomeSoloed: false,
    parts: {},
  })
  const mixerStateRef = useRef(mixerState)
  const [toneReady, setToneReady] = useState(false)

  const scoreTimeline = useMemo(() => {
    const tempoChanges = options.tempoChanges ?? []
    const totalTicks = parsedEvents.reduce(
      (latest, event) => Math.max(latest, event.time + event.duration),
      0
    )
    return {
      tempoChanges,
      totalTicks,
      totalDuration: ticksToScoreSeconds(totalTicks, tempoChanges),
    }
  }, [options.tempoChanges, parsedEvents])

  useEffect(() => {
    mixerStateRef.current = mixerState
  }, [mixerState])

  useEffect(() => {
    setTotalDuration(scoreTimeline.totalDuration)
  }, [scoreTimeline.totalDuration, setTotalDuration])

  useEffect(() => {
    // 停止中に楽譜上の音符を選んだ場合も、次回の開始位置へ反映する。
    if (!isPlaying && highlightedNoteTime !== null) {
      playbackPositionTicksRef.current = highlightedNoteTime
    }
  }, [highlightedNoteTime, isPlaying, scoreTimeline.totalTicks])

  useEffect(() => {
    tempoMultiplierRef.current = tempoPercentage / 100

    if (!toneReady || !_toneModule) return

    const transport = _toneModule.getTransport()
    const currentTicks = Number(transport.ticks)
    const activeTempo = (options.tempoChanges ?? []).reduce(
      (bpm, change) => (change.time <= currentTicks ? change.bpm : bpm),
      options.tempoChanges?.[0]?.bpm ?? 120
    )
    transport.bpm.value = activeTempo * tempoMultiplierRef.current
  }, [options.tempoChanges, tempoPercentage, toneReady])

  useEffect(() => {
    onNoteStartRef.current = options.onNoteStart
    onPlaybackStartRef.current = options.onPlaybackStart
    onPlaybackStopRef.current = options.onPlaybackStop
    onSeekRef.current = options.onSeek
    resolveSeekTicksRef.current = options.resolveSeekTicks
  }, [
    options.onNoteStart,
    options.onPlaybackStart,
    options.onPlaybackStop,
    options.onSeek,
    options.resolveSeekTicks,
  ])

  useEffect(() => {
    if (!isPlaying || !toneReady || !_toneModule) return

    const updatePosition = () => {
      const transport = _toneModule!.getTransport()
      const ticks = Math.min(scoreTimeline.totalTicks, Number(transport.ticks))
      playbackPositionTicksRef.current = ticks
      const scoreTime = ticksToScoreSeconds(ticks, scoreTimeline.tempoChanges)
      setCurrentTime(scoreTime)

      if (scoreTimeline.totalTicks > 0 && ticks >= scoreTimeline.totalTicks) {
        setHighlightedNote(scoreTimeline.totalTicks)
        setIsPlaying(false)
        return
      }
    }
    const intervalId = window.setInterval(updatePosition, 100)

    return () => window.clearInterval(intervalId)
  }, [
    isPlaying,
    scoreTimeline,
    setCurrentTime,
    setHighlightedNote,
    setIsPlaying,
    toneReady,
  ])

  // Tone.js の遅延ロード：parsedEvents が存在したら初めてロードする
  useEffect(() => {
    if (parsedEvents.length === 0) return
    let cancelled = false
    void getTone()
      .then(() => {
        if (!cancelled) setToneReady(true)
      })
      .catch((error: unknown) => {
        logger.error('Tone.js loading failed:', error)
      })
    return () => {
      cancelled = true
    }
  }, [parsedEvents])

  const partDescriptors = useMemo(() => {
    const parts = new Map<string, string>()

    parsedEvents.forEach((event) => {
      if (!event.partId || parts.has(event.partId)) return

      parts.set(
        event.partId,
        event.partName || event.instrumentName || event.partId
      )
    })

    return Array.from(parts, ([id, name]) => ({ id, name }))
  }, [parsedEvents])

  const partSamplerDescriptors = useMemo(() => {
    const descriptors = new Map<
      string,
      { partId: string; samplerId: NoteEvent['samplerId'] }
    >()

    parsedEvents.forEach((event) => {
      if (!event.partId) return

      const key = `${event.partId}:${event.samplerId}`
      if (!descriptors.has(key)) {
        descriptors.set(key, {
          partId: event.partId,
          samplerId: event.samplerId,
        })
      }
    })

    return Array.from(descriptors.entries(), ([key, descriptor]) => ({
      key,
      ...descriptor,
    }))
  }, [parsedEvents])

  const requiredSamplerConfigs = useMemo(() => {
    if (!toneReady || !_toneModule || parsedEvents.length === 0) {
      return EMPTY_SAMPLER_CONFIGS
    }

    return getRequiredSamplerConfigs(parsedEvents, _toneModule)
  }, [parsedEvents, toneReady])

  const requiredSampleSignature = useMemo(
    () =>
      (Object.entries(requiredSamplerConfigs) as [SamplerId, SamplerConfig][])
        .map(
          ([samplerId, config]) =>
            `${samplerId}:${Object.keys(config.urls).sort().join(',')}`
        )
        .sort()
        .join('|'),
    [requiredSamplerConfigs]
  )

  const measureStartTicks = useMemo(() => {
    const startsByMeasure = new Map<number, number>()

    parsedEvents.forEach((event) => {
      const currentStart = startsByMeasure.get(event.measureNumber)
      if (currentStart === undefined || event.time < currentStart) {
        startsByMeasure.set(event.measureNumber, event.time)
      }
    })

    return new Set(startsByMeasure.values())
  }, [parsedEvents])

  useEffect(() => {
    activePartIdsRef.current = new Set(partDescriptors.map((part) => part.id))
  }, [partDescriptors])

  useEffect(() => {
    measureStartTicksRef.current = measureStartTicks
  }, [measureStartTicks])

  useEffect(() => {
    if (!toneReady) return
    const Tone = _toneModule!
    masterLimiterRef.current = new Tone.Limiter(
      MASTER_LIMITER_THRESHOLD_DB
    ).toDestination()
    masterChannelRef.current = new Tone.Channel({
      volume: mixerValueToDecibels(
        mixerStateRef.current.masterVolume,
        MAX_MASTER_BOOST_DB
      ),
    }).connect(masterLimiterRef.current)
    metronomeChannelRef.current = new Tone.Channel().connect(
      masterChannelRef.current
    )

    metronomeSynthRef.current = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.001,
        decay: 0.04,
        sustain: 0,
        release: 0.04,
      },
    }).connect(metronomeChannelRef.current)
    metronomeLoopRef.current = new Tone.Loop((time) => {
      const tick = Math.round(Tone.getTransport().getTicksAtTime(time))
      const isMeasureStart =
        measureStartTicksRef.current.size > 0
          ? measureStartTicksRef.current.has(tick)
          : tick % DEFAULT_MEASURE_TICKS === 0

      metronomeSynthRef.current?.triggerAttackRelease(
        isMeasureStart ? METRONOME_ACCENT_NOTE : METRONOME_BEAT_NOTE,
        '32n',
        time,
        isMeasureStart ? 1 : METRONOME_BEAT_VOLUME_MULTIPLIER
      )
    }, '4n')

    return () => {
      metronomeLoopRef.current?.dispose()
      metronomeSynthRef.current?.dispose()
      metronomeChannelRef.current?.dispose()
      masterChannelRef.current?.dispose()
      masterLimiterRef.current?.dispose()
      metronomeChannelRef.current = null
      masterChannelRef.current = null
      masterLimiterRef.current = null
    }
  }, [toneReady])

  useEffect(() => {
    let isDisposed = false
    const configEntries = Object.entries(requiredSamplerConfigs) as [
      SamplerId,
      SamplerConfig,
    ][]

    sharedSampleBuffersRef.current = {}

    if (configEntries.length === 0) return

    let loadedCount = 0
    const sharedBuffers: Partial<
      Record<SamplerId, ToneModule.ToneAudioBuffers>
    > = {}
    const handleBuffersLoaded = () => {
      loadedCount += 1
      if (!isDisposed && loadedCount === configEntries.length) {
        setLoadedSamplerConfigs(requiredSamplerConfigs)
      }
    }

    configEntries.forEach(([samplerId, config]) => {
      const Tone = _toneModule!
      sharedBuffers[samplerId] = new Tone.ToneAudioBuffers({
        urls: config.urls,
        baseUrl: config.baseUrl,
        onload: handleBuffersLoaded,
      })
    })
    sharedSampleBuffersRef.current = sharedBuffers

    return () => {
      isDisposed = true
      Object.values(sharedBuffers).forEach((buffers) => buffers?.dispose())
      sharedSampleBuffersRef.current = {}
    }
  }, [requiredSampleSignature, requiredSamplerConfigs])

  useEffect(() => {
    const masterChannel = masterChannelRef.current
    if (!masterChannel || loadedSamplerConfigs !== requiredSamplerConfigs) {
      return
    }

    const currentSamplers: Record<string, ToneModule.Sampler> = {}
    const configEntries = Object.entries(requiredSamplerConfigs) as [
      SamplerId,
      SamplerConfig,
    ][]

    configEntries.forEach(([samplerId, config]) => {
      const buffers = sharedSampleBuffersRef.current[samplerId]
      if (!buffers) return

      currentSamplers[samplerId] = createSamplerFromSharedBuffers(
        buffers,
        Object.keys(config.urls)
      ).connect(masterChannel)
    })
    samplers.current = currentSamplers

    return () => {
      Object.values(currentSamplers).forEach((sampler) => sampler.dispose())
      samplers.current = {}
    }
  }, [loadedSamplerConfigs, requiredSamplerConfigs])

  useEffect(() => {
    const masterChannel = masterChannelRef.current
    if (!masterChannel || loadedSamplerConfigs !== requiredSamplerConfigs) {
      return
    }
    const channels: Record<string, ToneModule.Channel> = {}
    const partSamplers: Record<string, ToneModule.Sampler> = {}
    const glissandoPartSamplers: Record<string, ToneModule.Sampler> = {}
    const currentMixerState = mixerStateRef.current
    const hasSolo =
      currentMixerState.soloPartId !== null &&
      activePartIdsRef.current.has(currentMixerState.soloPartId)

    partDescriptors.forEach((part) => {
      const partState =
        currentMixerState.parts[part.id] ?? getDefaultPartState()

      const Tone = _toneModule!
      channels[part.id] = new Tone.Channel({
        volume: mixerValueToDecibels(partState.volume, MAX_PART_BOOST_DB),
        mute:
          currentMixerState.metronomeSoloed ||
          partState.isMuted ||
          (hasSolo && currentMixerState.soloPartId !== part.id),
      }).connect(masterChannel)
    })

    partSamplerDescriptors.forEach(({ key, partId, samplerId }) => {
      const channel = channels[partId]
      if (!channel) return

      const buffers = sharedSampleBuffersRef.current[samplerId]
      const config = requiredSamplerConfigs[samplerId]
      if (!buffers || !config) return

      partSamplers[key] = createSamplerFromSharedBuffers(
        buffers,
        Object.keys(config.urls)
      ).connect(channel)
      glissandoPartSamplers[key] = createSamplerFromSharedBuffers(
        buffers,
        Object.keys(config.urls),
        GLISSANDO_RELEASE_SECONDS
      ).connect(channel)
    })

    partChannelsRef.current = channels
    partSamplersRef.current = partSamplers
    glissandoPartSamplersRef.current = glissandoPartSamplers

    return () => {
      Object.values(partSamplers).forEach((sampler) => sampler.dispose())
      Object.values(glissandoPartSamplers).forEach((sampler) =>
        sampler.dispose()
      )
      Object.values(channels).forEach((channel) => channel.dispose())
      partSamplersRef.current = {}
      glissandoPartSamplersRef.current = {}
      partChannelsRef.current = {}
    }
  }, [
    loadedSamplerConfigs,
    partDescriptors,
    partSamplerDescriptors,
    requiredSamplerConfigs,
  ])

  useEffect(() => {
    const hasSolo =
      mixerState.soloPartId !== null &&
      activePartIdsRef.current.has(mixerState.soloPartId)

    Object.entries(partChannelsRef.current).forEach(([partId, channel]) => {
      const partState = mixerState.parts[partId] ?? getDefaultPartState()

      channel.volume.rampTo(
        mixerValueToDecibels(partState.volume, MAX_PART_BOOST_DB),
        VOLUME_RAMP_SECONDS
      )
      channel.mute =
        mixerState.metronomeSoloed ||
        partState.isMuted ||
        (hasSolo && mixerState.soloPartId !== partId)
    })

    masterChannelRef.current?.volume.rampTo(
      mixerValueToDecibels(mixerState.masterVolume, MAX_MASTER_BOOST_DB),
      VOLUME_RAMP_SECONDS
    )

    if (metronomeChannelRef.current) {
      metronomeChannelRef.current.volume.rampTo(
        mixerValueToDecibels(mixerState.metronomeVolume, MAX_PART_BOOST_DB),
        VOLUME_RAMP_SECONDS
      )
      metronomeChannelRef.current.mute = mixerState.metronomeMuted || hasSolo
    }
  }, [mixerState])

  // parsedEvents から Tone.Part を構築
  useEffect(() => {
    if (partRef.current) {
      partRef.current.dispose()
      partRef.current = null
    }
    if (!toneReady || !_toneModule) return

    const swingChanges = options.swingChanges ?? []
    const partEvents = parsedEvents.map((event) => {
      const playbackTiming = getSwingPlaybackTiming(event, swingChanges)
      return {
        time: `${playbackTiming.time}i`,
        event,
        playbackDuration: playbackTiming.duration,
      }
    })

    const Tone = _toneModule!
    const transport = Tone.getTransport()
    tempoScheduleIdsRef.current.forEach((id) => transport.clear(id))
    tempoScheduleIdsRef.current = []

    const tempoChanges = options.tempoChanges ?? []
    transport.bpm.value =
      (tempoChanges[0]?.bpm ?? 120) * tempoMultiplierRef.current
    tempoChanges.slice(1).forEach((change) => {
      const id = transport.schedule((time) => {
        transport.bpm.setValueAtTime(
          change.bpm * tempoMultiplierRef.current,
          time
        )
      }, `${change.time}i`)
      tempoScheduleIdsRef.current.push(id)
    })

    partRef.current = new Tone.Part((time, value) => {
      const { event, playbackDuration } = value
      if (event.isRest || event.isTieContinuation) return

      const glissandoDuration =
        event.glissandoDuration === null
          ? null
          : event.glissandoDuration === event.duration
            ? playbackDuration
            : event.glissandoDuration

      Tone.getDraw().schedule(() => {
        onNoteStartRef.current?.(event)
      }, time)

      const sampler =
        partSamplersRef.current[`${event.partId}:${event.samplerId}`]
      const samplerVolumeMultiplier = getSamplerVolumeMultiplier(
        event.samplerId
      )

      if (sampler?.loaded) {
        if (
          event.samplerId === 'piano' &&
          event.glissandoMode !== null &&
          event.glissandoTargetMidi !== null &&
          glissandoDuration !== null &&
          glissandoDuration > 0 &&
          event.glissandoTargetMidi !== event.midi
        ) {
          const buffers = sharedSampleBuffersRef.current.piano
          const channel = partChannelsRef.current[event.partId]
          if (!buffers || !channel) return

          const endTime = time + Tone.Ticks(glissandoDuration).toSeconds()
          const pianoKeyMap = getPianoSampleKeyByMidi(Tone)
          const sampleKeys = Array.from(
            new Set([
              getClosestPianoSampleKey(event.midi, pianoKeyMap),
              getClosestPianoSampleKey(event.glissandoTargetMidi, pianoKeyMap),
            ])
          )
          const sourceGain =
            (getDynamicGain(event.velocity) * GLISSANDO_VOLUME_MULTIPLIER) /
            (sampleKeys.length === 1 ? 1 : 1.25)

          sampleKeys.forEach((sampleKey) => {
            const buffer = buffers.get(sampleKey)
            if (!buffer?.loaded) return

            const sampleMidi = Tone.Frequency(sampleKey).toMidi()
            const startRate = 2 ** ((event.midi - sampleMidi) / 12)
            const endRate =
              2 ** ((event.glissandoTargetMidi! - sampleMidi) / 12)
            const source = new Tone.ToneBufferSource({
              url: buffer,
              playbackRate: startRate,
              fadeOut: GLISSANDO_RELEASE_SECONDS,
            }).connect(channel)

            activeGlissandoSourcesRef.current.add(source)
            source.onended = () => {
              activeGlissandoSourcesRef.current.delete(source)
              source.dispose()
            }
            source.playbackRate.linearRampToValueAtTime(endRate, endTime)
            source.start(time, 0, `${glissandoDuration}i`, sourceGain)
          })
          return
        }

        if (
          event.glissandoTargetMidi !== null &&
          glissandoDuration !== null &&
          glissandoDuration > 0 &&
          event.glissandoTargetMidi !== event.midi
        ) {
          const glissandoSampler =
            glissandoPartSamplersRef.current[
              `${event.partId}:${event.samplerId}`
            ]
          if (!glissandoSampler?.loaded) return

          const direction = event.glissandoTargetMidi > event.midi ? 1 : -1
          const stepCount = Math.abs(event.glissandoTargetMidi - event.midi)
          const glissandoWindow = glissandoDuration * GLISSANDO_PORTION
          const headDuration = glissandoDuration - glissandoWindow
          const intermediateCount = Math.max(1, stepCount - 1)
          const stepDuration = glissandoWindow / intermediateCount

          // 頭の音を約2/3保持し、中間音は末尾1/3で重ならないよう順に鳴らす。
          sampler.triggerAttackRelease(
            event.playbackKey,
            `${Math.min(playbackDuration, headDuration)}i`,
            time,
            getDynamicGain(event.velocity) *
              samplerVolumeMultiplier *
              GLISSANDO_VOLUME_MULTIPLIER
          )

          for (let index = 1; index < stepCount; index += 1) {
            const playbackKey = getGlissandoPlaybackKey(
              event.samplerId,
              event.midi + index * direction,
              Tone
            )
            if (!playbackKey) continue

            glissandoSampler.triggerAttackRelease(
              playbackKey,
              `${Math.max(1, stepDuration * 0.95)}i`,
              time +
                Tone.Ticks(
                  headDuration + (index - 1) * stepDuration
                ).toSeconds(),
              getDynamicGain(event.velocity) *
                samplerVolumeMultiplier *
                GLISSANDO_VOLUME_MULTIPLIER
            )
          }
          return
        }

        if (
          event.samplerId === 'drum' &&
          event.rollSubdivision !== null &&
          event.rollSubdivision > 0
        ) {
          const hitDuration = Math.min(
            event.rollSubdivision * 0.8,
            playbackDuration
          )
          for (
            let offset = 0;
            offset < playbackDuration;
            offset += event.rollSubdivision
          ) {
            sampler.triggerAttackRelease(
              event.playbackKey,
              `${hitDuration}i`,
              time + Tone.Ticks(offset).toSeconds(),
              getDynamicGain(event.velocity) *
                samplerVolumeMultiplier *
                DRUM_ROLL_VOLUME_MULTIPLIER
            )
          }
          return
        }

        // MuseScore の既定値（staccatoGateTime = 50）に合わせて、
        // 発音時間だけを記譜音価の 50% にする。次の音の開始時刻は変えない。
        const gateTime = event.isStaccato ? 0.5 : 1
        sampler.triggerAttackRelease(
          event.playbackKey,
          `${playbackDuration * gateTime}i`,
          time,
          getDynamicGain(event.velocity) * samplerVolumeMultiplier
        )
      }
    }, partEvents)

    partRef.current.start(0)

    return () => {
      partRef.current?.dispose()
      tempoScheduleIdsRef.current.forEach((id) => transport.clear(id))
      tempoScheduleIdsRef.current = []
    }
  }, [options.swingChanges, options.tempoChanges, parsedEvents, toneReady])

  // isPlaying に応じて Transport の開始/停止を同期
  useEffect(() => {
    if (!toneReady) return
    const Tone = _toneModule!

    if (isPlaying) {
      // Tone.js の tick 記法（`123i`）には整数だけを渡す。
      // 小数tickを文字列化すると、一部のモバイルブラウザで桁違いの
      // Transport位置として解釈されることがある。
      const startTicks = Math.max(
        0,
        Math.round(playbackPositionTicksRef.current)
      )
      playbackPositionTicksRef.current = startTicks
      const transport = Tone.getTransport()
      const activeTempo = (options.tempoChanges ?? []).reduce(
        (bpm, change) => (change.time <= startTicks ? change.bpm : bpm),
        options.tempoChanges?.[0]?.bpm ?? 120
      )
      transport.bpm.value = activeTempo * tempoMultiplierRef.current

      onPlaybackStartRef.current?.(startTicks)
      metronomeLoopRef.current?.start(0)
      // 前回停止時の内部タイムラインが残っていても、開始offsetを必ず適用する。
      if (transport.state !== 'stopped') transport.stop()
      transport.start(undefined, `${startTicks}i`)
      requestAnimationFrame(() => {
        const appliedTicks = Number(transport.ticks)
        const maximumExpectedAdvance = TICKS_PER_QUARTER / 4
        if (Math.abs(appliedTicks - startTicks) > maximumExpectedAdvance) {
          logger.warn('[playback-position] correcting start position', {
            requestedTicks: startTicks,
            appliedTicks,
          })
          transport.ticks = startTicks
        }
      })
    } else {
      Tone.getDraw().cancel()
      Tone.getTransport().stop()
      metronomeLoopRef.current?.stop()
      Object.values(samplers.current).forEach((s) => s.releaseAll())
      Object.values(partSamplersRef.current).forEach((s) => s.releaseAll())
      Object.values(glissandoPartSamplersRef.current).forEach((s) =>
        s.releaseAll()
      )
      activeGlissandoSourcesRef.current.forEach((source) => {
        source.stop()
      })
      activeGlissandoSourcesRef.current.clear()
      metronomeSynthRef.current?.triggerRelease()
      if (hasObservedPlaybackStateRef.current) {
        onPlaybackStopRef.current?.()
      }
    }
    hasObservedPlaybackStateRef.current = true
  }, [isPlaying, options.tempoChanges, scoreTimeline.totalTicks, toneReady])

  const play = useCallback(async () => {
    configurePlaybackAudioSession()
    const Tone = await getTone()
    await Tone.start()

    // 最後まで再生した後は、再生ボタンで先頭から再開する。
    if (
      scoreTimeline.totalTicks > 0 &&
      playbackPositionTicksRef.current >= scoreTimeline.totalTicks
    ) {
      playbackPositionTicksRef.current = 0
      setCurrentTime(0)
      setHighlightedNote(0)
      onSeekRef.current?.(0)
    }
    setIsPlaying(true)
  }, [
    scoreTimeline.totalTicks,
    setCurrentTime,
    setHighlightedNote,
    setIsPlaying,
  ])

  const stop = useCallback(() => {
    if (_toneModule) {
      const transport = _toneModule.getTransport()
      if (transport.state === 'started') {
        const stoppedTicks = Math.min(
          scoreTimeline.totalTicks,
          Math.max(0, Number(transport.ticks))
        )
        playbackPositionTicksRef.current = stoppedTicks
        setCurrentTime(
          ticksToScoreSeconds(stoppedTicks, scoreTimeline.tempoChanges)
        )
        setHighlightedNote(stoppedTicks)
      }
    }
    setIsPlaying(false)
  }, [scoreTimeline, setCurrentTime, setHighlightedNote, setIsPlaying])

  const beginSeek = useCallback(() => {
    if (isSeekingRef.current) return

    isSeekingRef.current = true
    resumeAfterSeekRef.current = useScoreStore.getState().isPlaying
    if (resumeAfterSeekRef.current) stop()
  }, [stop])

  const previewSeek = useCallback(
    (time: number) => {
      beginSeek()

      const clampedTime = Math.min(
        scoreTimeline.totalDuration,
        Math.max(0, time)
      )
      const requestedTicks = Math.round(
        Math.min(
          scoreTimeline.totalTicks,
          scoreSecondsToTicks(clampedTime, scoreTimeline.tempoChanges)
        )
      )
      const ticks = Math.min(
        scoreTimeline.totalTicks,
        Math.max(
          0,
          Math.round(
            resolveSeekTicksRef.current?.(requestedTicks) ?? requestedTicks
          )
        )
      )
      playbackPositionTicksRef.current = ticks
      setCurrentTime(ticksToScoreSeconds(ticks, scoreTimeline.tempoChanges))
      setHighlightedNote(ticks)
      onSeekRef.current?.(ticks)
    },
    [beginSeek, scoreTimeline, setCurrentTime, setHighlightedNote]
  )

  const commitSeek = useCallback(() => {
    if (!isSeekingRef.current) return

    isSeekingRef.current = false
    const shouldResume = resumeAfterSeekRef.current
    resumeAfterSeekRef.current = false
    if (shouldResume) void play()
  }, [play])

  const cancelSeek = useCallback(() => {
    isSeekingRef.current = false
    resumeAfterSeekRef.current = false
  }, [])

  const playNote: PlayNoteFn = useCallback(
    async (samplerId, playbackKey, durationBeats) => {
      configurePlaybackAudioSession()
      const Tone = await getTone()
      await Tone.start()

      const sampler = samplers.current[samplerId] ?? samplers.current.piano
      if (!sampler || !sampler.loaded) return

      const durationSeconds = durationBeats * Tone.Time('4n').toSeconds()

      sampler.triggerAttackRelease(
        playbackKey,
        durationSeconds,
        Tone.now(),
        getSamplerVolumeMultiplier(samplerId)
      )
    },
    []
  )

  const soloPart = useCallback((partId: string) => {
    setMixerState((state) => {
      if (!activePartIdsRef.current.has(partId)) return state

      return {
        ...state,
        soloPartId: partId,
        metronomeSoloed: false,
        parts: {
          ...state.parts,
          [partId]: {
            ...(state.parts[partId] ?? getDefaultPartState()),
            isMuted: false,
          },
        },
      }
    })
  }, [])

  const clearSoloPart = useCallback(() => {
    setMixerState((state) =>
      state.soloPartId === null ? state : { ...state, soloPartId: null }
    )
  }, [])

  const mutePart = useCallback((partId: string) => {
    setMixerState((state) => {
      const partState = state.parts[partId]
      if (partState?.isMuted) return state

      return {
        ...state,
        parts: {
          ...state.parts,
          [partId]: { ...(partState ?? getDefaultPartState()), isMuted: true },
        },
      }
    })
  }, [])

  const unmutePart = useCallback((partId: string) => {
    setMixerState((state) => {
      const partState = state.parts[partId]
      if (!partState?.isMuted) return state

      return {
        ...state,
        parts: {
          ...state.parts,
          [partId]: { ...partState, isMuted: false },
        },
      }
    })
  }, [])

  const setPartVolume = useCallback((partId: string, volume: number) => {
    const nextVolume = clampVolume(volume)

    setMixerState((state) => {
      const partState = state.parts[partId]
      if (partState?.volume === nextVolume) return state

      return {
        ...state,
        parts: {
          ...state.parts,
          [partId]: {
            ...(partState ?? getDefaultPartState()),
            volume: nextVolume,
          },
        },
      }
    })
  }, [])

  const muteAll = useCallback(() => {
    setMixerState((state) => ({
      ...state,
      parts: {
        ...state.parts,
        ...Object.fromEntries(
          partDescriptors.map((part) => [
            part.id,
            {
              ...(state.parts[part.id] ?? getDefaultPartState()),
              isMuted: true,
            },
          ])
        ),
      },
    }))
  }, [partDescriptors])

  const unmuteAll = useCallback(() => {
    setMixerState((state) => ({
      ...state,
      soloPartId: null,
      parts: {
        ...state.parts,
        ...Object.fromEntries(
          partDescriptors.map((part) => [
            part.id,
            {
              ...(state.parts[part.id] ?? getDefaultPartState()),
              isMuted: false,
            },
          ])
        ),
      },
    }))
  }, [partDescriptors])

  const setMasterVolume = useCallback(
    (volume: number) => {
      const nextVolume = clampVolume(volume)
      setStoreVolume(nextVolume)
      setMixerState((state) =>
        state.masterVolume === nextVolume
          ? state
          : { ...state, masterVolume: nextVolume }
      )
    },
    [setStoreVolume]
  )

  const setMetronomeVolume = useCallback((volume: number) => {
    const nextVolume = clampVolume(volume)
    setMixerState((state) =>
      state.metronomeVolume === nextVolume
        ? state
        : { ...state, metronomeVolume: nextVolume }
    )
  }, [])

  const muteMetronome = useCallback(() => {
    setMixerState((state) =>
      state.metronomeMuted ? state : { ...state, metronomeMuted: true }
    )
  }, [])

  const unmuteMetronome = useCallback(() => {
    setMixerState((state) =>
      state.metronomeMuted ? { ...state, metronomeMuted: false } : state
    )
  }, [])

  const soloMetronome = useCallback(() => {
    setMixerState((state) =>
      state.metronomeSoloed && state.soloPartId === null
        ? state
        : { ...state, metronomeSoloed: true, soloPartId: null }
    )
  }, [])

  const clearMetronomeSolo = useCallback(() => {
    setMixerState((state) =>
      state.metronomeSoloed ? { ...state, metronomeSoloed: false } : state
    )
  }, [])

  const mixerControls = useMemo<AudioMixerControls>(
    () => ({
      parts: partDescriptors.map((part) => {
        const partState = mixerState.parts[part.id] ?? getDefaultPartState()

        return {
          ...part,
          volume: partState.volume,
          isMuted: partState.isMuted,
          isSoloed: mixerState.soloPartId === part.id,
        }
      }),
      masterVolume: mixerState.masterVolume,
      metronomeVolume: mixerState.metronomeVolume,
      isMetronomeMuted: mixerState.metronomeMuted,
      isMetronomeSoloed: mixerState.metronomeSoloed,
      soloPart,
      clearSoloPart,
      mutePart,
      unmutePart,
      setPartVolume,
      muteAll,
      unmuteAll,
      setMasterVolume,
      setMetronomeVolume,
      muteMetronome,
      unmuteMetronome,
      soloMetronome,
      clearMetronomeSolo,
    }),
    [
      clearMetronomeSolo,
      clearSoloPart,
      mixerState,
      muteMetronome,
      muteAll,
      mutePart,
      partDescriptors,
      setMasterVolume,
      setMetronomeVolume,
      setPartVolume,
      soloMetronome,
      soloPart,
      unmuteAll,
      unmuteMetronome,
      unmutePart,
    ]
  )

  const playbackControls = useMemo<AudioPlaybackControls>(
    () => ({ beginSeek, previewSeek, commitSeek, cancelSeek }),
    [beginSeek, cancelSeek, commitSeek, previewSeek]
  )

  return { play, stop, playNote, mixerControls, playbackControls }
}

export type PlayNoteFn = (
  samplerId: string,
  playbackKey: string | number,
  durationBeats: number
) => Promise<void>

// React 型を使わず構造的に表現
export const createPlayNote = (samplersRef: {
  current: Record<string, ToneModule.Sampler> | undefined | null
}): PlayNoteFn => {
  return async (samplerId, playbackKey, durationBeats) => {
    configurePlaybackAudioSession()
    const Tone = await getTone()
    await Tone.start()

    const sampler =
      samplersRef.current?.[samplerId] ?? samplersRef.current?.piano
    if (!sampler || !sampler.loaded) return
    const durationSeconds = durationBeats * Tone.Time('4n').toSeconds()
    sampler.triggerAttackRelease(playbackKey, durationSeconds, Tone.now())
  }
}

import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  Info,
  Microphone,
  MicrophoneSlash,
  VideoCamera,
  VideoCameraSlash,
  WarningCircle,
} from '@phosphor-icons/react'
import {
  ApiError,
  describeError,
  type EngineAudio,
  type EngineFilter,
  type EngineLevel,
  type studioEngineApi,
} from '@ferrocast/api'
import { Button, IconButton, Skeleton } from '@ferrocast/ui'
import { CleanMicControl } from '../studio/desk/cleanmic-ui'
import { MIC_KINDS } from '../studio/desk/cleanmic'
import { Meter, useLevels } from '../studio/desk/mixer'
import { useLevelFeed, useLevelStatus } from '../studio/desk/meter-feed'

type EngineApi = ReturnType<typeof studioEngineApi>

const CAMERA_POLL_MS = 1000
const CAMERA_BACKOFF_MS = 5000

const CAMERA_KINDS = [
  'av_capture_input_v2',
  'macos-avcapture',
  'macos-avcapture-fast',
  'dshow_input',
  'v4l2_input',
  'av_capture_input',
]
const INPUT_AUDIO_KINDS = [
  'coreaudio_input_capture',
  'wasapi_input_capture',
  'pulse_input_capture',
  'alsa_input_capture',
]

interface DeviceChoice {
  label: string
  value: string
  kind: string
}

export function BrowserMicFallback({ onClose }: { onClose?: (() => void) | undefined }) {
  const [state, setState] = useState<'idle' | 'active' | 'denied' | 'unsupported'>('idle')
  const [peakDb, setPeakDb] = useState(-100)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const aliveRef = useRef(true)

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    void ctxRef.current?.close().catch(() => undefined)
    ctxRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setState('idle')
    onClose?.()
  }, [onClose])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      stop()
    }
  }, [stop])
  // The picture goes to the video once it is on the page (it only exists while the test runs).
  const [hasVideo, setHasVideo] = useState(false)
  useEffect(() => {
    if (state === 'active' && videoRef.current && streamRef.current && hasVideo)
      videoRef.current.srcObject = streamRef.current
  }, [state, hasVideo])

  const startBrowserTest = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unsupported')
      return
    }
    try {
      // Camera and mic together; with no camera (or it refused) the mic alone still tests.
      let stream: MediaStream
      let video = true
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      } catch {
        video = false
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      }
      // Left the step while the browser was asking: let the camera and mic go at once.
      if (!aliveRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      setHasVideo(video)
      const AudioCtx = window.AudioContext
      if (AudioCtx) {
        const ctx = new AudioCtx()
        ctxRef.current = ctx
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        src.connect(analyser)
        const buf = new Float32Array(analyser.fftSize)
        const loop = () => {
          analyser.getFloatTimeDomainData(buf)
          let max = 0
          for (const v of buf) {
            const a = Math.abs(v)
            if (a > max) max = a
          }
          const db = max > 1e-5 ? 20 * Math.log10(max) : -100
          setPeakDb(db)
          rafRef.current = requestAnimationFrame(loop)
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      setState('active')
    } catch {
      // Whatever was opened is let go (a failed audio setup must not leave the camera on).
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setState('denied')
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface-1 p-5">
      <div className="flex items-start gap-2.5">
        <Info size={18} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
        <div className="text-[13.5px] text-text-2">
          <p className="font-semibold text-text">Desktop audio filters run in the Ferrocast app</p>
          <p className="mt-1">
            You can preview your camera and mic through this browser, or continue to finish setup
            and use Clean up my mic in Studio on your PC.
          </p>
        </div>
      </div>

      {state === 'active' && (
        <div className="flex flex-col gap-3">
          {hasVideo && (
            <video
              ref={videoRef}
              aria-label="Browser camera preview"
              autoPlay
              playsInline
              muted
              className="aspect-video w-full max-w-[360px] rounded-[12px] bg-surface-2 object-cover"
            />
          )}
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-medium text-text-2">Browser mic input</span>
            <span className="font-mono text-[13px] font-semibold tabular-nums text-text">
              {peakDb <= -95 ? 'Silent' : `${peakDb.toFixed(0)} dB`}
            </span>
          </div>
          <Button size="sm" variant="secondary" onClick={stop}>
            Stop browser test
          </Button>
        </div>
      )}

      {state === 'denied' && (
        <p className="text-[13px] text-warn">
          This browser did not allow the camera or microphone. Allow them in the site settings (the
          icon at the left of the address bar), then press Test again, or Continue without.
        </p>
      )}
      {state === 'unsupported' && (
        <p className="text-[13px] text-text-3">
          This browser does not expose camera and mic devices here.
        </p>
      )}

      {state !== 'active' && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => void startBrowserTest()}>
            Test camera and mic in browser
          </Button>
        </div>
      )}
    </div>
  )
}

export function MediaCheckStep({
  engine,
  headingId,
  headingRef,
  onBack,
  onEdited,
  onContinue,
}: {
  engine: EngineApi
  headingId: string
  headingRef: Ref<HTMLHeadingElement>
  onBack: () => void
  /** The mic was changed here (device, level, mute, clean-up). */
  onEdited?: () => void
  onContinue: () => void
}) {
  const [initLoading, setInitLoading] = useState(true)
  const [initError, setInitError] = useState<unknown>(null)
  const [unavailable, setUnavailable] = useState(false)

  const [cameras, setCameras] = useState<DeviceChoice[]>([])
  const [selectedCam, setSelectedCam] = useState<DeviceChoice | null>(null)
  const [stillUrl, setStillUrl] = useState<string | null>(null)
  const [camLoading, setCamLoading] = useState(false)
  const [camError, setCamError] = useState<unknown>(null)
  const [camProblem, setCamProblem] = useState<string | null>(null)
  const [camWaiting, setCamWaiting] = useState(false)
  // The option that names the camera (it differs by system).
  const [camKey, setCamKey] = useState('device')
  const refreshCameraRef = useRef<() => void>(() => undefined)

  const [mics, setMics] = useState<DeviceChoice[]>([])
  const [selectedMic, setSelectedMic] = useState('')
  const [micSwitching, setMicSwitching] = useState(false)
  const [micAudio, setMicAudio] = useState<EngineAudio | null>(null)
  const [micFilters, setMicFilters] = useState<EngineFilter[] | null>(null)
  const [micError, setMicError] = useState<unknown>(null)
  const [refreshingDevices, setRefreshingDevices] = useState(false)
  const [heardSignal, setHeardSignal] = useState(false)
  const heardRef = useRef(false)
  heardRef.current = heardSignal
  const probeReqRef = useRef(0)
  const initInFlightRef = useRef(false)
  const blockedByInitRef = useRef(true)
  blockedByInitRef.current = initLoading || unavailable || initError !== null
  const micAudioRef = useRef<EngineAudio | null>(null)
  micAudioRef.current = micAudio
  const confirmedMicRef = useRef('')
  const micSwitchReqRef = useRef(0)
  const minSampleSeqRef = useRef(0)

  const probeMedia = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      if (quiet && initInFlightRef.current) return
      const req = ++probeReqRef.current
      if (quiet) {
        setRefreshingDevices(true)
      } else {
        initInFlightRef.current = true
        setInitLoading(true)
        setInitError(null)
        setUnavailable(false)
        setCamError(null)
        setMicError(null)
      }
      try {
        const status = await engine.status()
        if (probeReqRef.current !== req) return
        if (!status.available) {
          if (!quiet) setUnavailable(true)
          return
        }
        if (!status.running) {
          if (quiet) return
          await engine.start()
          if (probeReqRef.current !== req) return
        }

        const [kinds, scenes] = await Promise.all([engine.kinds(), engine.scenes()])
        if (probeReqRef.current !== req) return
        const camKind =
          kinds.inputs.find((k) => CAMERA_KINDS.includes(k.id))?.id ?? 'av_capture_input_v2'
        const micKind =
          kinds.inputs.find((k) => INPUT_AUDIO_KINDS.includes(k.id))?.id ?? 'coreaudio_input_capture'

        const [camOpts, micOpts, audioList] = await Promise.all([
          engine.options(camKind).catch(() => []),
          engine.options(micKind).catch(() => []),
          engine.audio(scenes.current).catch(() => [] as EngineAudio[]),
        ])
        if (probeReqRef.current !== req) return

        const devOpt = camOpts.find(
          (o) => o.key === 'device' || o.key === 'video_device_id' || o.key === 'device_id',
        )
        setCamKey(devOpt?.key ?? 'device')
        const camChoices: DeviceChoice[] = (devOpt?.choices ?? []).map((label, i) => ({
          label,
          value: String(devOpt?.values?.[i] ?? label),
          kind: camKind,
        }))
        setCameras(camChoices)
        setSelectedCam((prev) => {
          if (prev) {
            const match = camChoices.find((c) => c.value === prev.value && c.kind === prev.kind)
            if (match) return match.label === prev.label ? prev : match
          }
          return camChoices[0] ?? null
        })

        const micDevOpt = micOpts.find((o) => o.key === 'device_id')
        const micChoices: DeviceChoice[] = (micDevOpt?.choices ?? []).map((label, i) => ({
          label,
          value: String(micDevOpt?.values?.[i] ?? 'default'),
          kind: micKind,
        }))
        setMics(micChoices)

        const foundMic =
          audioList.find((a) => MIC_KINDS.has(a.kind)) ??
          audioList.find((a) => a.name.toLowerCase().includes('mic')) ??
          null
        if (quiet && micAudioRef.current !== null && foundMic !== null) {
          if (foundMic.name !== micAudioRef.current.name) {
            setMicAudio(foundMic)
          }
          return
        }

        ++micSwitchReqRef.current
        setMicSwitching(false)
        minSampleSeqRef.current = 0
        if (foundMic) {
          const micSettings = await engine.settings(foundMic.name).catch(() => null)
          if (probeReqRef.current !== req) return
          const configured = micSettings?.device_id
          const matched =
            typeof configured === 'string' && configured.length > 0 ? configured : 'default'
          confirmedMicRef.current = matched
          setMicAudio(foundMic)
          setSelectedMic(matched)
        } else if (micChoices.some((c) => c.value !== 'default')) {
          // A name nothing in the collection uses yet (an imported one may have a "Mic" in a scene).
          const taken = new Set((await engine.sources().catch(() => [])).map((x) => x.name))
          if (probeReqRef.current !== req) return
          let micNew = 'Mic'
          for (let n = 2; taken.has(micNew); n++) micNew = `Mic ${n}`
          const initialMic = micChoices[0]!.value
          await engine.setChannel(3, {
            kind: micKind,
            name: micNew,
            settings: { device_id: initialMic },
          })
          if (probeReqRef.current !== req) return
          const refreshed = await engine.audio(scenes.current).catch(() => [] as EngineAudio[])
          if (probeReqRef.current !== req) return
          confirmedMicRef.current = initialMic
          setMicAudio(
            refreshed.find((a) => a.name === micNew) ?? {
              name: micNew,
              kind: micKind,
              channel: 3,
              volume_db: 0,
              muted: false,
              monitor: 'off',
            },
          )
          setSelectedMic(initialMic)
        } else {
          confirmedMicRef.current = ''
          setMicAudio(null)
          setSelectedMic('')
        }
      } catch (e) {
        if (probeReqRef.current !== req || quiet) return
        if (e instanceof ApiError && e.code === 'studio_unavailable') {
          setUnavailable(true)
        } else {
          setInitError(e)
        }
      } finally {
        if (!quiet) initInFlightRef.current = false
        if (probeReqRef.current === req) {
          if (!quiet) setInitLoading(false)
          setRefreshingDevices(false)
        }
      }
    },
    [engine],
  )

  useEffect(() => {
    void probeMedia()
    const probes = probeReqRef
    return () => {
      probes.current += 1
    }
  }, [probeMedia])

  useEffect(() => {
    const onFocus = () => {
      if (document.hidden || initInFlightRef.current || blockedByInitRef.current) return
      void probeMedia({ quiet: true })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [probeMedia])

  useEffect(() => {
    if (!selectedCam) {
      setStillUrl(null)
      setCamLoading(false)
      setCamError(null)
      setCamProblem(null)
      setCamWaiting(false)
      refreshCameraRef.current = () => undefined
      return
    }

    let alive = true
    let hadStill = false
    let activeAc: AbortController | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    setStillUrl(null)
    setCamLoading(true)
    setCamError(null)
    setCamProblem(null)
    setCamWaiting(false)

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }

    const schedule = (ms: number) => {
      clearTimer()
      if (!alive || document.hidden) return
      timer = setTimeout(() => {
        timer = null
        void runOnce()
      }, ms)
    }

    const runOnce = async (fresh = false) => {
      if (!alive || document.hidden || activeAc !== null) return
      clearTimer()
      const reqAc = new AbortController()
      activeAc = reqAc
      let nextDelay = CAMERA_POLL_MS
      try {
        const res = fresh
          ? await engine.sourceStill(selectedCam.kind, camKey, selectedCam.value, 480, reqAc.signal, {
              fresh: true,
            })
          : await engine.sourceStill(selectedCam.kind, camKey, selectedCam.value, 480, reqAc.signal)
        if (!alive || activeAc !== reqAc || reqAc.signal.aborted) return
        if (res.image) {
          hadStill = true
          setStillUrl(res.image)
          setCamProblem(null)
          setCamError(null)
          setCamWaiting(false)
          nextDelay = CAMERA_POLL_MS
        } else if (res.waiting || !res.error) {
          setStillUrl(null)
          setCamError(null)
          setCamProblem(null)
          setCamWaiting(true)
          nextDelay = CAMERA_BACKOFF_MS
        } else {
          hadStill = false
          setStillUrl(null)
          setCamError(null)
          setCamWaiting(false)
          setCamProblem(res.error)
          nextDelay = CAMERA_BACKOFF_MS
        }
      } catch (e) {
        if (
          !alive ||
          activeAc !== reqAc ||
          reqAc.signal.aborted ||
          (e as { name?: string })?.name === 'AbortError'
        ) {
          return
        }
        nextDelay = CAMERA_BACKOFF_MS
        if (hadStill) {
          // Picture stopped after working (e.g. iPhone Continuity Camera slept): keep checking calmly.
          setStillUrl(null)
          setCamError(null)
          setCamProblem(null)
          setCamWaiting(true)
        } else {
          setCamWaiting(false)
          setCamError(e)
        }
      } finally {
        if (activeAc === reqAc) {
          activeAc = null
          if (alive) {
            setCamLoading(false)
            if (!document.hidden && !reqAc.signal.aborted) schedule(nextDelay)
          }
        }
      }
    }

    const onVisibilityChange = () => {
      if (!alive) return
      if (document.hidden) {
        clearTimer()
        activeAc?.abort()
        activeAc = null
      } else {
        void runOnce()
      }
    }

    refreshCameraRef.current = () => {
      if (!alive || activeAc !== null) return
      clearTimer()
      void runOnce(true)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    if (!document.hidden) void runOnce()

    return () => {
      alive = false
      refreshCameraRef.current = () => undefined
      clearTimer()
      activeAc?.abort()
      activeAc = null
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [selectedCam, engine, camKey])

  const micName = micAudio?.name ?? null
  const reloadMicFilters = useCallback(async () => {
    if (!micName) return
    try {
      const f = await engine.filters(micName)
      setMicFilters(f)
      setMicError(null)
    } catch (e) {
      setMicError(e)
    }
  }, [engine, micName])

  useEffect(() => {
    if (!micName) {
      setMicFilters(null)
      return
    }
    void reloadMicFilters()
  }, [micName, reloadMicFilters])

  const trackedNames = useMemo(() => (micName ? [micName] : []), [micName])
  const feed = useLevelFeed(engine, trackedNames)
  const feedStatus = useLevelStatus(feed, micName)
  const levels: Record<string, EngineLevel> = useLevels(engine, trackedNames)
  const currentLevel = micName ? levels[micName] : undefined
  const micMuted = !!micAudio?.muted
  const matchedMicChoice = mics.find((m) => m.value === selectedMic)
  const unavailableMicLabel =
    selectedMic === 'default' ? 'System default microphone' : 'Saved microphone (not plugged in)'
  const showUnavailableOption = Boolean(selectedMic) && !matchedMicChoice
  const micLabel =
    matchedMicChoice?.label ??
    (showUnavailableOption ? unavailableMicLabel : (micAudio?.name ?? 'your microphone'))

  useEffect(() => {
    setHeardSignal(false)
  }, [micName, selectedMic, micMuted])

  useEffect(() => {
    if (!micName || micMuted || micSwitching) return
    const check = () => {
      if (heardRef.current) return
      if (feed.seq && feed.seq() <= minSampleSeqRef.current) return
      const lv = feed.get(micName)
      if (!lv) return
      if (Math.max(lv.peak[0] ?? -100, lv.peak[1] ?? -100) > -60) {
        setHeardSignal(true)
      }
    }
    check()
    return feed.subscribe(check)
  }, [feed, micName, micMuted, micSwitching])

  const switchMicDevice = async (value: string) => {
    if (!micAudio) return
    const req = ++micSwitchReqRef.current
    setSelectedMic(value)
    setMicSwitching(true)
    setHeardSignal(false)
    setMicError(null)
    try {
      // In place: only the device changes, so the mic keeps its filters, volume and mute (and
      // a mic that lives in a scene, as in an imported collection, can be switched too).
      await engine.update(micAudio.name, { device_id: value })
      if (micSwitchReqRef.current !== req) return
      confirmedMicRef.current = value
      minSampleSeqRef.current = (feed.seq?.() ?? 0) + (feed.busy?.() ? 1 : 0)
      setMicSwitching(false)
      onEdited?.()
    } catch (e) {
      if (micSwitchReqRef.current !== req) return
      setSelectedMic(confirmedMicRef.current)
      setMicSwitching(false)
      setMicError(e)
    }
  }

  const toggleMute = async () => {
    if (!micAudio) return
    const nextMuted = !micAudio.muted
    setMicAudio({ ...micAudio, muted: nextMuted })
    try {
      await engine.setAudio(micAudio.name, { muted: nextMuted })
      onEdited?.()
    } catch (e) {
      setMicAudio({ ...micAudio, muted: !nextMuted })
      setMicError(e)
    }
  }

  const updateVolume = async (volume_db: number) => {
    if (!micAudio) return
    const rounded = Math.round(volume_db * 10) / 10
    setMicAudio({ ...micAudio, volume_db: rounded })
    try {
      await engine.setAudio(micAudio.name, { volume_db: rounded })
      onEdited?.()
    } catch (e) {
      // The mic went away: the slider says what it is, and the mic error says what to do.
      setMicError(e)
    }
  }

  const describedInitError = initError ? describeError(initError) : null
  const describedCamError = camError ? describeError(camError) : null
  const describedMicError = micError ? describeError(micError) : null

  return (
    <>
      <div>
        <h1
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-[28px] font-extrabold tracking-[-0.03em] text-balance focus:outline-none sm:text-[32px]"
        >
          Camera and mic check
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-text-2">
          Check your camera framing and voice level, and clean up your mic in one click.
        </p>
      </div>

      {initLoading && (
        <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-3">
          <p className="text-[13.5px] text-text-2">Checking cameras and microphones...</p>
          <Skeleton className="h-44 w-full rounded-[14px]" />
          <Skeleton className="h-28 w-full rounded-[14px]" />
        </div>
      )}

      {!initLoading && unavailable && <BrowserMicFallback />}

      {!initLoading && describedInitError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-[14px] border border-danger/40 bg-danger-soft p-4"
        >
          <div className="flex items-start gap-2.5">
            <WarningCircle
              size={18}
              weight="bold"
              className="mt-0.5 shrink-0 text-danger"
              aria-hidden
            />
            <div className="text-[13.5px]">
              <p className="font-semibold text-text">{describedInitError.message}</p>
              {describedInitError.hint && (
                <p className="mt-0.5 text-text-2">{describedInitError.hint}</p>
              )}
            </div>
          </div>
          <div>
            <Button
              size="sm"
              variant="secondary"
              icon={<ArrowsClockwise size={15} />}
              onClick={() => void probeMedia()}
            >
              Try again
            </Button>
          </div>
        </div>
      )}

      {!initLoading && !unavailable && !describedInitError && (
        <div className="flex flex-col gap-4">
          <section
            aria-label="Camera preview"
            className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface-1 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {cameras.length > 0 ? (
                  <VideoCamera size={18} className="text-accent-text" aria-hidden />
                ) : (
                  <VideoCameraSlash size={18} className="text-text-3" aria-hidden />
                )}
                <h2 className="text-[15px] font-bold text-text">Camera preview</h2>
              </div>
              {cameras.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {cameras.length > 1 && (
                    <label className="flex items-center gap-2 text-[13px] text-text-2">
                      <span className="sr-only">Choose camera</span>
                      <select
                        aria-label="Choose camera"
                        value={selectedCam?.value ?? ''}
                        onChange={(e) => {
                          const next = cameras.find((c) => c.value === e.target.value) ?? null
                          setSelectedCam(next)
                        }}
                        className="h-8 max-w-[220px] rounded-control max-sm:h-11 border border-line-strong bg-surface-2 px-2.5 text-[13px] text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                      >
                        {cameras.map((cam) => (
                          <option key={cam.value} value={cam.value}>
                            {cam.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <IconButton
                    label="Refresh devices"
                    size="sm"
                    variant="outline"
                    className="max-sm:size-11"
                    aria-busy={refreshingDevices || undefined}
                    onClick={() => void probeMedia({ quiet: true })}
                  >
                    <ArrowsClockwise
                      size={15}
                      className={refreshingDevices ? 'animate-spin' : undefined}
                      aria-hidden
                    />
                  </IconButton>
                </div>
              )}
            </div>

            {cameras.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-dashed border-line-strong bg-surface-2 px-4 py-5">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-text">No camera detected</p>
                  <p className="mt-0.5 text-[13px] text-text-2">
                    Plug in a camera anytime, or continue without one.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<ArrowsClockwise size={15} />}
                  onClick={() => void probeMedia()}
                >
                  Check again
                </Button>
              </div>
            ) : camLoading && !stillUrl && !camWaiting && !camProblem && !describedCamError ? (
              <Skeleton className="aspect-video w-full max-w-[420px] rounded-[12px]" />
            ) : describedCamError ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-warn/40 bg-warn/10 px-4 py-3 text-[13px]">
                <div className="min-w-0">
                  <p className="font-semibold text-text">{describedCamError.message}</p>
                  {describedCamError.hint && (
                    <p className="mt-0.5 text-text-2">{describedCamError.hint}</p>
                  )}
                </div>
                {selectedCam && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<ArrowsClockwise size={15} />}
                    onClick={() => refreshCameraRef.current()}
                  >
                    Retry camera
                  </Button>
                )}
              </div>
            ) : camProblem && !stillUrl ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-warn/40 bg-warn/10 px-4 py-3 text-[13px]"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-text">
                    Ferrocast can’t see {selectedCam?.label ?? 'the camera'}.
                  </p>
                  <p className="mt-0.5 text-text-2">{camProblem}</p>
                </div>
                {selectedCam && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<ArrowsClockwise size={15} />}
                    onClick={() => refreshCameraRef.current()}
                  >
                    Retry camera
                  </Button>
                )}
              </div>
            ) : stillUrl ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="w-full shrink-0 overflow-hidden rounded-[12px] border border-line bg-surface-2 sm:w-[280px]">
                  <img
                    src={stillUrl}
                    alt={`Preview from ${selectedCam?.label ?? 'camera'}`}
                    className="aspect-video w-full object-cover"
                  />
                </div>
                <div className="flex flex-col items-start gap-2">
                  <p className="text-[13px] leading-relaxed text-text-2">
                    Checks automatically every second while open. Check framing and lighting before
                    going live.
                  </p>
                  {selectedCam && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<ArrowsClockwise size={15} />}
                      onClick={() => refreshCameraRef.current()}
                    >
                      Refresh frame
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line bg-surface-2 px-4 py-4 text-[13px] text-text-2">
                <span>
                  Waiting for your camera. An iPhone can switch off when it sleeps or locks: unlock
                  it and keep it near. Ferrocast will pick it up again.
                </span>
                {selectedCam && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<ArrowsClockwise size={15} />}
                    onClick={() => refreshCameraRef.current()}
                  >
                    Refresh frame
                  </Button>
                )}
              </div>
            )}
          </section>

          <section
            aria-label="Microphone check"
            className="flex flex-col gap-3 rounded-[16px] border border-line bg-surface-1 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {micAudio ? (
                  <Microphone size={18} className="text-ok" aria-hidden />
                ) : (
                  <MicrophoneSlash size={18} className="text-text-3" aria-hidden />
                )}
                <h2 className="text-[15px] font-bold text-text">Microphone and level</h2>
              </div>
              {(mics.length > 0 || Boolean(micAudio)) && (
                <div className="flex items-center gap-1.5">
                  {(mics.length > 1 || (mics.length > 0 && showUnavailableOption)) && micAudio && (
                    <select
                      aria-label="Choose microphone"
                      value={selectedMic}
                      onChange={(e) => void switchMicDevice(e.target.value)}
                      className="h-8 max-w-[220px] rounded-control max-sm:h-11 border border-line-strong bg-surface-2 px-2.5 text-[13px] text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                    >
                      {showUnavailableOption && (
                        <option value={selectedMic}>{unavailableMicLabel}</option>
                      )}
                      {mics.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <IconButton
                    label="Refresh devices"
                    size="sm"
                    variant="outline"
                    className="max-sm:size-11"
                    aria-busy={refreshingDevices || undefined}
                    onClick={() => void probeMedia({ quiet: true })}
                  >
                    <ArrowsClockwise
                      size={15}
                      className={refreshingDevices ? 'animate-spin' : undefined}
                      aria-hidden
                    />
                  </IconButton>
                </div>
              )}
            </div>

            {!micAudio ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-dashed border-line-strong bg-surface-2 px-4 py-5">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-text">No microphone detected</p>
                  <p className="mt-0.5 text-[13px] text-text-2">
                    Plug in a mic anytime, or continue and add sound later in Studio.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<ArrowsClockwise size={15} />}
                  onClick={() => void probeMedia()}
                >
                  Check again
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <IconButton
                    label={`Mute ${micAudio.name}`}
                    aria-pressed={micAudio.muted}
                    size="sm"
                    className="max-sm:size-11"
                    variant="outline"
                    onClick={() => void toggleMute()}
                  >
                    {micAudio.muted ? (
                      <MicrophoneSlash size={16} className="text-danger" />
                    ) : (
                      <Microphone size={16} />
                    )}
                  </IconButton>
                  <div className="min-w-0 flex-1">
                    <Meter
                      feed={feed}
                      feedName={micAudio.name}
                      muted={micAudio.muted}
                      volumeDb={micAudio.volume_db}
                      label={`${micAudio.name} volume`}
                      onVolume={(db) => void updateVolume(db)}
                      tall
                      scale
                    />
                  </div>
                </div>

                {feedStatus === 'disconnected' ? (
                  <div
                    role="status"
                    className="rounded-[10px] border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-text"
                  >
                    <p className="font-semibold">Microphone meter is not connected.</p>
                    <p className="mt-0.5 text-text-2">
                      Ferrocast is not receiving live audio levels from the engine yet. Continue
                      setup to open Studio, or reopen Ferrocast and try again.
                    </p>
                  </div>
                ) : (
                  feedStatus === 'connected' &&
                  !micSwitching &&
                  (micAudio.muted || !heardSignal) && (
                    <p role="status" className="text-[13px] text-text-2">
                      No sound from {micLabel} yet. Say something, or check the mic is not muted.
                    </p>
                  )
                )}

                {describedMicError && (
                  <p role="alert" className="text-[13px] text-danger">
                    {describedMicError.message}
                  </p>
                )}

                <CleanMicControl
                  api={engine}
                  name={micAudio.name}
                  level={currentLevel}
                  filters={micFilters}
                  onReload={() => void reloadMicFilters()}
                  onCleaned={() => onEdited?.()}
                  className="border-t border-line pt-3"
                />
              </div>
            )}
          </section>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" variant="ghost" icon={<ArrowLeft size={18} />} onClick={onBack}>
          Back
        </Button>
        <Button
          size="lg"
          variant="primary"
          onClick={onContinue}
          icon={<ArrowRight size={18} />}
          className="flex-row-reverse"
        >
          Continue
        </Button>
      </div>
    </>
  )
}

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
import { useLevelFeed } from '../studio/desk/meter-feed'

type EngineApi = ReturnType<typeof studioEngineApi>

const CAMERA_KINDS = ['av_capture_input_v2', 'dshow_input', 'v4l2_input', 'av_capture_input']
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
  // The option that names the camera (it differs by system).
  const [camKey, setCamKey] = useState('device')

  const [mics, setMics] = useState<DeviceChoice[]>([])
  const [micAudio, setMicAudio] = useState<EngineAudio | null>(null)
  const [micFilters, setMicFilters] = useState<EngineFilter[] | null>(null)
  const [micError, setMicError] = useState<unknown>(null)
  const probeReqRef = useRef(0)

  const probeMedia = useCallback(async () => {
    const req = ++probeReqRef.current
    setInitLoading(true)
    setInitError(null)
    setUnavailable(false)
    setCamError(null)
    setMicError(null)
    try {
      const status = await engine.status()
      if (probeReqRef.current !== req) return
      if (!status.available) {
        setUnavailable(true)
        return
      }
      if (!status.running) {
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
      setSelectedCam(camChoices[0] ?? null)

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
      if (foundMic) {
        setMicAudio(foundMic)
      } else if (micChoices.some((c) => c.value !== 'default')) {
        // A name nothing in the collection uses yet (an imported one may have a "Mic" in a scene).
        const taken = new Set((await engine.sources().catch(() => [])).map((x) => x.name))
        if (probeReqRef.current !== req) return
        let micNew = 'Mic'
        for (let n = 2; taken.has(micNew); n++) micNew = `Mic ${n}`
        await engine.setChannel(3, {
          kind: micKind,
          name: micNew,
          settings: { device_id: micChoices[0]!.value },
        })
        if (probeReqRef.current !== req) return
        const refreshed = await engine.audio(scenes.current).catch(() => [] as EngineAudio[])
        if (probeReqRef.current !== req) return
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
      } else {
        setMicAudio(null)
      }
    } catch (e) {
      if (probeReqRef.current !== req) return
      if (e instanceof ApiError && e.code === 'studio_unavailable') {
        setUnavailable(true)
      } else {
        setInitError(e)
      }
    } finally {
      if (probeReqRef.current === req) setInitLoading(false)
    }
  }, [engine])

  useEffect(() => {
    void probeMedia()
    const probes = probeReqRef
    return () => {
      probes.current += 1
    }
  }, [probeMedia])

  const loadCameraStill = useCallback(
    async (cam: DeviceChoice, signal?: AbortSignal) => {
      setCamLoading(true)
      setCamError(null)
      setCamProblem(null)
      try {
        const res = await engine.sourceStill(cam.kind, camKey, cam.value, 480, signal)
        if (!signal?.aborted) {
          setStillUrl(res.image)
          // No picture with a reason (the camera is off for this app, or in use): say it.
          if (!res.image && res.error) setCamProblem(res.error)
        }
      } catch (e) {
        if (!signal?.aborted && (e as { name?: string })?.name !== 'AbortError') {
          setCamError(e)
        }
      } finally {
        if (!signal?.aborted) setCamLoading(false)
      }
    },
    [engine, camKey],
  )

  useEffect(() => {
    if (!selectedCam) {
      setStillUrl(null)
      return
    }
    const ac = new AbortController()
    void loadCameraStill(selectedCam, ac.signal)
    return () => ac.abort()
  }, [selectedCam, loadCameraStill])

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
  const levels: Record<string, EngineLevel> = useLevels(engine, trackedNames)
  const currentLevel = micName ? levels[micName] : undefined

  const switchMicDevice = async (value: string) => {
    if (!micAudio) return
    try {
      // In place: only the device changes, so the mic keeps its filters, volume and mute (and
      // a mic that lives in a scene, as in an imported collection, can be switched too).
      await engine.update(micAudio.name, { device_id: value })
      onEdited?.()
    } catch (e) {
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
            ) : camLoading && !stillUrl ? (
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
                    onClick={() => void loadCameraStill(selectedCam)}
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
                    onClick={() => void loadCameraStill(selectedCam)}
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
                    Snapshot updates when refreshed. Check framing and lighting before going live.
                  </p>
                  {selectedCam && (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<ArrowsClockwise size={15} />}
                      onClick={() => void loadCameraStill(selectedCam)}
                    >
                      Refresh frame
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-[12px] border border-line bg-surface-2 px-4 py-4 text-[13px] text-text-2">
                <span>Camera connected: {selectedCam?.label}. Preview is warming up.</span>
                {selectedCam && (
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => void loadCameraStill(selectedCam)}
                  >
                    Refresh
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
              {mics.length > 1 && micAudio && (
                <select
                  aria-label="Choose microphone"
                  defaultValue={mics[0]?.value ?? 'default'}
                  onChange={(e) => void switchMicDevice(e.target.value)}
                  className="h-8 max-w-[220px] rounded-control max-sm:h-11 border border-line-strong bg-surface-2 px-2.5 text-[13px] text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                >
                  {mics.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
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

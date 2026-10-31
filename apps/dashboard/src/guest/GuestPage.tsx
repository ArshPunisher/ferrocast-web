import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera,
  CameraSlash,
  Microphone,
  MicrophoneSlash,
  PhoneDisconnect,
  ShieldCheck,
  VideoCamera,
} from '@phosphor-icons/react'
import { Button, Field, IconButton, Input, Select, Wordmark, cx } from '@ferrocast/ui'
import { describeMediaError, inviteToken, join, openMedia, type Call, type CallError } from './call'

type Stage = 'off' | 'ready' | 'joining' | 'live' | 'ended'
type Link = 'connecting' | 'connected' | 'reconnecting'

const NAME_KEY = 'fc-guest-name'

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

/** A guest's page: their camera, their name, Join, then mute, camera off and Leave. */
export function GuestPage() {
  const token = inviteToken(location.hash)
  const [stage, setStage] = useState<Stage>('off')
  const [link, setLink] = useState<Link>('connecting')
  const [error, setError] = useState<CallError | null>(null)
  const [name, setName] = useState(savedName)
  const [nameError, setNameError] = useState<string | null>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [cameraId, setCameraId] = useState('')
  const [micId, setMicId] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const media = useRef<MediaStream | null>(null)
  const call = useRef<Call | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)

  const show = (s: MediaStream) => {
    media.current = s
    if (video.current) video.current.srcObject = s
  }

  const listDevices = async () => {
    const all = await navigator.mediaDevices.enumerateDevices()
    setCameras(all.filter((d) => d.kind === 'videoinput'))
    setMics(all.filter((d) => d.kind === 'audioinput'))
  }

  const start = async (cam?: string, mic?: string) => {
    setError(null)
    try {
      const s = await openMedia(cam || undefined, mic || undefined)
      const old = media.current
      show(s)
      // Swapped while live: the streamer gets the new camera or mic without a new call.
      const c = call.current
      if (c) {
        await c.video?.replaceTrack(s.getVideoTracks()[0] ?? null)
        await c.audio?.replaceTrack(s.getAudioTracks()[0] ?? null)
      }
      for (const t of s.getAudioTracks()) t.enabled = micOn
      for (const t of s.getVideoTracks()) t.enabled = camOn
      old?.getTracks().forEach((t) => t.stop())
      setCameraId(s.getVideoTracks()[0]?.getSettings().deviceId ?? '')
      setMicId(s.getAudioTracks()[0]?.getSettings().deviceId ?? '')
      await listDevices()
      // Off or after leaving: ready to join (a device swapped mid-call stays live).
      if (!call.current) setStage('ready')
    } catch (e) {
      setError(describeMediaError(e))
    }
  }

  const leave = useCallback(() => {
    call.current?.pc.close()
    call.current = null
    // The camera's light goes off too; Join again turns them back on.
    media.current?.getTracks().forEach((t) => t.stop())
    media.current = null
    setStage('ended')
  }, [])

  useEffect(
    () => () => {
      call.current?.pc.close()
      media.current?.getTracks().forEach((t) => t.stop())
    },
    [],
  )

  const onJoin = async () => {
    const n = name.trim()
    if (!n) {
      setNameError('Enter your name, so the streamer knows who you are.')
      nameInput.current?.focus()
      return
    }
    if (!token || !media.current) return
    setNameError(null)
    setError(null)
    setStage('joining')
    try {
      localStorage.setItem(NAME_KEY, n)
    } catch {
      // Storage blocked: the name is asked again next time.
    }
    try {
      const c = await join(token, n, media.current)
      call.current = c
      setLink('connecting')
      c.pc.addEventListener('connectionstatechange', () => {
        const s = c.pc.connectionState
        if (s === 'connected') setLink('connected')
        else if (s === 'disconnected') setLink('reconnecting')
        else if (s === 'failed') {
          setError({
            message: 'Lost the connection to the streamer.',
            hint: 'Join again to come back.',
          })
          leave()
        }
      })
      setStage('live')
    } catch (e) {
      setError(e as CallError)
      setStage('ready')
    }
  }

  const toggleMic = () => {
    const on = !micOn
    media.current?.getAudioTracks().forEach((t) => (t.enabled = on))
    setMicOn(on)
  }
  const toggleCam = () => {
    const on = !camOn
    media.current?.getVideoTracks().forEach((t) => (t.enabled = on))
    setCamOn(on)
  }

  if (!token) {
    return (
      <Shell>
        <Message
          title="This guest link is incomplete"
          body="Ask the streamer to send the whole link again."
        />
      </Shell>
    )
  }

  const live = stage === 'live'
  return (
    <Shell>
      <div className="grid w-full gap-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:items-start">
        <div className="relative aspect-video w-full overflow-hidden rounded-panel border border-line bg-surface-2">
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            aria-label="Your camera"
            className={cx(
              'size-full -scale-x-100 object-cover',
              (!camOn || stage === 'off') && 'invisible',
            )}
          />
          {(stage === 'off' || !camOn) && (
            <div className="absolute inset-0 grid place-items-center text-text-3">
              {stage === 'off' ? (
                <VideoCamera size={40} aria-hidden />
              ) : (
                <CameraSlash size={40} aria-hidden />
              )}
            </div>
          )}
          {live && (
            <div
              role="status"
              className={cx(
                'absolute top-3 left-3 rounded-full bg-surface-1/90 px-3 py-1 text-[14px] font-semibold',
                link === 'connected' ? 'text-ok' : 'text-text-2',
              )}
            >
              {link === 'connected'
                ? 'Connected'
                : link === 'reconnecting'
                  ? 'Reconnecting'
                  : 'Connecting'}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {stage === 'ended' ? (
            <>
              <Message
                title={error ? error.message : 'You left'}
                body={error?.hint ?? 'Thanks for joining.'}
              />
              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  setError(null)
                  void start()
                }}
              >
                Join again
              </Button>
            </>
          ) : live ? (
            <>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-text">
                  You're in
                </h1>
                <p className="mt-1 text-text-2">The streamer chooses when you're on stream.</p>
              </div>
              <div className="flex items-center gap-3">
                <IconButton
                  label={micOn ? 'Mute mic' : 'Unmute mic'}
                  variant={micOn ? 'secondary' : 'danger'}
                  size="lg"
                  aria-pressed={!micOn}
                  onClick={toggleMic}
                >
                  {micOn ? <Microphone size={22} /> : <MicrophoneSlash size={22} />}
                </IconButton>
                <IconButton
                  label={camOn ? 'Turn camera off' : 'Turn camera on'}
                  variant={camOn ? 'secondary' : 'danger'}
                  size="lg"
                  aria-pressed={!camOn}
                  onClick={toggleCam}
                >
                  {camOn ? <Camera size={22} /> : <CameraSlash size={22} />}
                </IconButton>
                <Button
                  variant="danger"
                  size="lg"
                  icon={<PhoneDisconnect size={20} />}
                  onClick={leave}
                  className="ml-auto"
                >
                  Leave
                </Button>
              </div>
              {error && <ErrorNote error={error} />}
              <Devices
                cameras={cameras}
                mics={mics}
                cameraId={cameraId}
                micId={micId}
                onCamera={(id) => void start(id, micId)}
                onMic={(id) => void start(cameraId, id)}
              />
            </>
          ) : (
            <>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-text">
                  Join the stream
                </h1>
                <p className="mt-1 text-text-2">
                  {stage === 'off'
                    ? 'Turn on your camera and mic to get ready.'
                    : 'Check how you look, then join.'}
                </p>
              </div>
              {error && <ErrorNote error={error} />}
              {stage === 'off' ? (
                <Button variant="primary" size="lg" onClick={() => void start()}>
                  Turn on camera and mic
                </Button>
              ) : (
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void onJoin()
                  }}
                >
                  <Field label="Your name" error={nameError}>
                    {(p) => (
                      <Input
                        {...p}
                        ref={nameInput}
                        name="name"
                        value={name}
                        maxLength={40}
                        autoComplete="name"
                        enterKeyHint="go"
                        onChange={(e) => setName(e.target.value)}
                      />
                    )}
                  </Field>
                  <Devices
                    cameras={cameras}
                    mics={mics}
                    cameraId={cameraId}
                    micId={micId}
                    onCamera={(id) => void start(id, micId)}
                    onMic={(id) => void start(cameraId, id)}
                  />
                  <Button type="submit" variant="primary" size="lg" busy={stage === 'joining'}>
                    {stage === 'joining' ? 'Joining…' : 'Join'}
                  </Button>
                </form>
              )}
              <p className="flex items-start gap-2 text-[14px] text-text-3">
                <ShieldCheck size={18} aria-hidden className="mt-px shrink-0 text-accent-text" />
                Your camera goes straight to the streamer's computer.
              </p>
            </>
          )}
        </div>
      </div>
    </Shell>
  )
}

function Devices(p: {
  cameras: MediaDeviceInfo[]
  mics: MediaDeviceInfo[]
  cameraId: string
  micId: string
  onCamera: (id: string) => void
  onMic: (id: string) => void
}) {
  // One of each needs no picking.
  if (p.cameras.length < 2 && p.mics.length < 2) return null
  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-1">
      {p.cameras.length > 1 && (
        <Field label="Camera">
          {(f) => (
            <Select {...f} value={p.cameraId} onChange={(e) => p.onCamera(e.target.value)}>
              {p.cameras.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {p.mics.length > 1 && (
        <Field label="Mic">
          {(f) => (
            <Select {...f} value={p.micId} onChange={(e) => p.onMic(e.target.value)}>
              {p.mics.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Mic ${i + 1}`}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
    </div>
  )
}

function ErrorNote({ error }: { error: CallError }) {
  return (
    <div role="alert" className="rounded-control border border-danger/40 bg-danger-soft px-4 py-3">
      <p className="font-semibold text-danger">{error.message}</p>
      {error.hint && <p className="mt-0.5 text-[14px] text-text-2">{error.hint}</p>}
    </div>
  )
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-text">{title}</h1>
      <p className="mt-1 text-text-2">{body}</p>
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-bg">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pt-6 pb-10 md:px-8 md:pt-10">
        <Wordmark size="sm" />
        {children}
      </main>
    </div>
  )
}

// Settings › Music (25 Oct): where the beat and the song come from, for the music pieces,
// motion backgrounds and sound elements on your screens. Shows what plays right now.

import { useEffect, useMemo, useState } from 'react'
import {
  describeError,
  musicApi,
  type MusicConfig,
  type MusicView,
  type SongSource,
} from '@ferrocast/api'
import { Badge, Button, Field, Input, Segmented, Select, Skeleton, toast } from '@ferrocast/ui'
import { LoadError } from './Panel'
import { useStudio } from './studio/common'
import { useClient, useResource } from '../lib/hooks'

/** OBS sources that carry sound (listed first when picking the beat). */
const AUDIO_KINDS = [
  'wasapi_output_capture',
  'wasapi_input_capture',
  'wasapi_process_output_capture',
  'coreaudio_output_capture',
  'coreaudio_input_capture',
  'sck_audio_capture',
  'screen_capture',
  'pulse_output_capture',
  'pulse_input_capture',
  'pipewire_audio_capture',
  'alsa_input_capture',
  'ffmpeg_source',
  'vlc_source',
]

export function MusicSettings() {
  const client = useClient()
  const api = useMemo(() => musicApi(client), [client])
  const studio = useStudio()
  const res = useResource(() => api.get(), [api])
  const inputs = useResource(() => studio.obsInputs().catch(() => []), [studio])
  const [file, setFile] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** Text file picked but no file saved yet (the refresh mustn't undo the choice). */
  const [wantFile, setWantFile] = useState(false)
  const view = res.data
  const set = res.set
  useEffect(() => {
    if (view) setFile(view.config.file ?? '')
  }, [view?.config.file]) // eslint-disable-line react-hooks/exhaustive-deps
  // What plays, every second while this is open (the beat moves many times a second on stream).
  useEffect(() => {
    let alive = true
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void api
        .get()
        .then((v) => alive && set(v))
        .catch(() => undefined)
    }, 1000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [api, set])

  const save = async (patch: Partial<MusicConfig>) => {
    setBusy(true)
    setErr(null)
    try {
      set(await api.save(patch))
      setWantFile(false)
    } catch (e) {
      const d = describeError(e)
      // "file: pick…" names the field for code; here the field is right there.
      const message = d.message.replace(/^[a-z_]+: /, '')
      const said = message.charAt(0).toUpperCase() + message.slice(1)
      if ('file' in patch) setErr(said)
      else toast({ tone: 'warn', message: said, ...(d.hint ? { hint: d.hint } : {}) })
    } finally {
      setBusy(false)
    }
  }

  if (res.error && !view) return <LoadError error={res.error} onRetry={res.reload} />
  if (!view) return <Skeleton className="h-40" />
  const { config, now } = view
  const song: SongSource = wantFile ? 'file' : config.song
  const list = inputs.data ?? []
  const audio = list.filter((i) => AUDIO_KINDS.includes(i.kind))
  const other = list.filter((i) => !AUDIO_KINDS.includes(i.kind))
  const known = list.some((i) => i.name === config.beat_input)
  return (
    <div className="flex flex-col gap-4">
      <NowPlaying view={view} />
      <Field
        label="Beat from"
        hint="The OBS source your music plays through, often Desktop Audio."
        hintVisible={false}
        error={view.beat_problem}
      >
        {(p) => (
          <Select
            {...p}
            value={config.beat_input ?? ''}
            disabled={busy}
            onChange={(e) => void save({ beat_input: e.target.value || null })}
          >
            <option value="">No beat</option>
            {config.beat_input && !known && (
              <option value={config.beat_input}>{config.beat_input}</option>
            )}
            {audio.length > 0 && (
              <optgroup label="Sound">
                {audio.map((i) => (
                  <option key={i.name}>{i.name}</option>
                ))}
              </optgroup>
            )}
            {other.length > 0 && (
              <optgroup label="Other sources">
                {other.map((i) => (
                  <option key={i.name}>{i.name}</option>
                ))}
              </optgroup>
            )}
          </Select>
        )}
      </Field>
      {inputs.data && list.length === 0 && (
        <p className="-mt-2 text-[13px] text-text-3">Connect OBS to pick a source.</p>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13.5px] font-medium text-text-2">Song from</span>
        <Segmented<SongSource>
          label="Song from"
          size="sm"
          className="self-start"
          value={song}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'player', label: 'Music player' },
            { value: 'file', label: 'Text file' },
          ]}
          onChange={(next) => {
            if (next === 'file' && !config.file) {
              // Needs the file first: show the field, save once it's filled in.
              setWantFile(true)
              return
            }
            setWantFile(false)
            void save({ song: next })
          }}
        />
        {song === 'player' && (
          <p className="text-[13px] text-text-3">
            Spotify or Music on a Mac, any player on Windows.
          </p>
        )}
      </div>
      {song === 'file' && (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-start"
          onSubmit={(e) => {
            e.preventDefault()
            void save({ song: 'file', file: file.trim() || null })
          }}
        >
          <Field
            label="Song file"
            className="min-w-0 flex-1"
            hint="The .txt file Snip, Tuna or your player writes. Paste its full path."
            hintVisible={false}
            error={err}
          >
            {(p) => (
              <Input
                {...p}
                value={file}
                spellCheck={false}
                autoComplete="off"
                placeholder="/Users/you/Music/now-playing.txt"
                onChange={(e) => setFile(e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" variant="secondary" busy={busy} className="sm:mt-[30px]">
            Use file
          </Button>
        </form>
      )}
      {view.song_problem && config.song !== 'off' && (
        <p className="text-[13px] text-warn" role="status">
          {view.song_problem}
        </p>
      )}
      {!now.playing && (config.beat_input || config.song !== 'off') && (
        <p className="text-[13px] text-text-3">Music pieces stay hidden until something plays.</p>
      )}
    </div>
  )
}

/** The song and a level meter, as your screens see them. */
function NowPlaying({ view }: { view: MusicView }) {
  const { now } = view
  const song = [now.title, now.artist].filter(Boolean).join(' · ')
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-control border border-line bg-inset px-3 py-2.5">
      <Badge tone={now.playing ? 'ok' : 'neutral'}>{now.playing ? 'Playing' : 'Quiet'}</Badge>
      <span className="min-w-0 flex-1 truncate text-[13.5px] text-text" title={song || undefined}>
        {song || (now.playing ? 'No song name' : 'Nothing playing')}
      </span>
      <span
        role="meter"
        aria-label="Music level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(now.level * 100)}
        className="relative h-1.5 w-24 overflow-hidden rounded-full bg-surface-3"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${Math.round(now.level * 100)}%` }}
        />
      </span>
    </div>
  )
}

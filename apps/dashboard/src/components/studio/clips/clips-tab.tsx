// The Clips tab: the recordings folder as a library of clips (replay saves, Moments clips,
// vertical copies, recordings) to open, search, pick for a compilation, and the work in the
// background. Phones never get it: clips are files on the PC.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowsClockwise,
  ClosedCaptioning,
  FolderSimple,
  MagnifyingGlass,
  Record,
  Stack,
  UploadSimple,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { clipSize, relativeTime, type Clip, type ClipsApi } from '@ferrocast/api'
import { Badge, Button, IconButton, Select, Skeleton, cx, toast } from '@ferrocast/ui'
import { LoadError } from '../../Panel'
import { useAction, useNow } from '../../../lib/hooks'
import { go } from '../../../lib/router'
import { ClipDialog, type Section } from './clip-dialog'
import { KIND_LABEL } from './labels'
import { CompileDialog } from './compile-dialog'
import { JobsPanel } from './jobs-panel'
import { Thumb, useSeen, useThumb, type ThumbState } from './thumb'
import { useClips } from './use-clips'

function ClipCard({
  api,
  clip,
  ffmpegReady,
  now,
  selected,
  order,
  onOpen,
  onToggle,
}: {
  api: ClipsApi
  clip: Clip
  ffmpegReady: boolean
  now: number
  selected: boolean
  /** Its place in the compilation (1-based) when picked. */
  order: number
  onOpen: () => void
  onToggle: () => void
}) {
  const ref = useRef<HTMLLIElement>(null)
  const seen = useSeen(ref)
  const asked = useThumb(api, clip, ffmpegReady && seen)
  // FFmpeg makes the pictures: without it none can be.
  const thumb: ThumbState = ffmpegReady ? asked : { status: 'none' }
  return (
    <li
      ref={ref}
      data-clip={clip.id}
      className={cx(
        'group relative flex min-w-0 flex-col gap-2 rounded-panel border bg-surface-1 p-2.5 shadow-1 transition-colors duration-150',
        selected ? 'border-accent-line bg-accent-soft' : 'border-line hover:border-line-strong',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="fc-press flex min-w-0 flex-col gap-2 rounded-[12px] text-left focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
      >
        <Thumb state={thumb} vertical={clip.kind === 'vertical'} />
        <span className="flex min-w-0 flex-col gap-0.5 px-0.5">
          <span
            className="truncate text-[15.5px] font-bold text-text"
            title={clip.name}
            translate="no"
          >
            <span className="sr-only">Open </span>
            {clip.name}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-text-3">
            <span>{clipSize(clip.size)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {relativeTime(clip.modified, now) === 'now'
                ? 'just now'
                : `${relativeTime(clip.modified, now)} ago`}
            </span>
          </span>
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-1.5 px-0.5">
        <Badge tone={clip.kind === 'vertical' ? 'accent' : 'neutral'}>
          {KIND_LABEL[clip.kind]}
        </Badge>
        {clip.has_captions && <Badge tone="ok">Captions</Badge>}
      </div>
      <label
        className={cx(
          'absolute top-3.5 left-3.5 flex size-9 cursor-pointer items-center justify-center rounded-control border backdrop-blur-sm transition-colors duration-150',
          'has-[:focus-visible]:shadow-[var(--fc-focus)]',
          selected
            ? 'border-accent-line bg-accent text-on-accent'
            : 'border-white/25 bg-black/45 text-white opacity-90 hover:bg-black/60',
        )}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Pick ${clip.name} for a compilation`}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="text-[14px] leading-none font-extrabold peer-focus-visible:underline"
        >
          {selected ? order : ''}
        </span>
        {!selected && (
          <span
            aria-hidden="true"
            className="absolute size-4 rounded-[5px] border-2 border-white/80"
          />
        )}
      </label>
    </li>
  )
}

const PAGE = 60

/** The media wall: the full width, 1 column on a phone up to 5 on a wide window. */
const WALL =
  'grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

/** The Type dropdown: what each choice shows (Moments are the clips Ferrocast cut: trims and
 *  compilations). */
const TYPES = [
  { value: 'all', label: 'All', kinds: null },
  { value: 'moments', label: 'Moments', kinds: ['edit'] },
  { value: 'replays', label: 'Replays', kinds: ['replay'] },
  { value: 'vertical', label: 'Vertical', kinds: ['vertical'] },
  { value: 'recordings', label: 'Recordings', kinds: ['recording'] },
] as const
type TypeValue = (typeof TYPES)[number]['value']

/** "42 s", "1 min 5 s". */
export function spanText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return s % 60 === 0 ? `${m} min` : `${m} min ${s % 60} s`
}

function SkeletonGrid() {
  return (
    <ul aria-label="Loading clips" className={WALL}>
      {Array.from({ length: 6 }, (_, i) => (
        <li
          key={i}
          className="flex flex-col gap-2 rounded-panel border border-line bg-surface-1 p-2.5"
        >
          <Skeleton className="aspect-video w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3.5 w-1/3" />
        </li>
      ))}
    </ul>
  )
}

export function ClipsTab() {
  const data = useClips()
  const { api, overview, jobs } = data
  const { run } = useAction()
  const now = useNow(30_000)
  const [open, setOpen] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [compiling, setCompiling] = useState(false)
  const [type, setType] = useState<TypeValue>('all')
  // The part an open clip starts on (the toolbar's Upload goes straight to YouTube).
  const [openSection, setOpenSection] = useState<Section | undefined>(undefined)
  const { run: act } = useAction()
  // How long each picked clip is, read once (the list itself carries no length).
  const [lengths, setLengths] = useState<ReadonlyMap<string, number | null>>(new Map())
  // A long folder shows the newest first and more on request (each card is a picture and a row).
  const [shown, setShown] = useState(PAGE)
  const clips = useMemo(() => overview.data?.clips ?? [], [overview.data])
  const ids = useMemo(() => new Set(clips.map((c) => c.id)), [clips])
  // Every clip seen in any list: a pick is resolved here, so a search that hides a picked clip
  // (it only changes what is shown) doesn't drop it from the compilation.
  const [known, setKnown] = useState<ReadonlyMap<string, Clip>>(new Map())
  useEffect(() => {
    if (clips.length === 0) return
    setKnown((prev) => {
      const next = new Map(prev)
      for (const c of clips) next.set(c.id, c)
      return next
    })
  }, [clips])
  // A clip that is gone (renamed, deleted) leaves the picks, but only when the whole folder was
  // read again: a search result that lacks it proves nothing.
  const wholeFolder =
    data.asked === '' && data.query.trim() === '' && !overview.loading && overview.data !== null
  useEffect(() => {
    if (!wholeFolder) return
    setPicked((p) => (p.every((id) => ids.has(id)) ? p : p.filter((id) => ids.has(id))))
  }, [wholeFolder, ids])
  const live = picked
  const pick = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const searching = data.query.trim() !== ''
  const wanted = TYPES.find((t) => t.value === type)?.kinds ?? null
  const shownClips = useMemo(
    () => (wanted ? clips.filter((c) => (wanted as readonly string[]).includes(c.kind)) : clips),
    [clips, wanted],
  )
  const ffmpegReady = overview.data?.ffmpeg_ready ?? false
  useEffect(() => {
    if (!ffmpegReady) return
    let alive = true
    for (const id of picked) {
      if (lengths.has(id)) continue
      api
        .probe(id)
        .then((p) => alive && setLengths((m) => new Map(m).set(id, p.duration_ms)))
        .catch(() => alive && setLengths((m) => new Map(m).set(id, null)))
    }
    return () => {
      alive = false
    }
  }, [picked, lengths, api, ffmpegReady])
  const pickedClips = picked
    .map((id) => known.get(id) ?? clips.find((c) => c.id === id))
    .filter((c): c is Clip => !!c)
  const allKnown = picked.length > 0 && picked.every((id) => typeof lengths.get(id) === 'number')
  const total = allKnown
    ? spanText(picked.reduce((n, id) => n + (lengths.get(id) ?? 0), 0))
    : clipSize(pickedClips.reduce((n, c) => n + c.size, 0))
  const copyFolder = async () => {
    const folder = overview.data?.folder
    if (!folder) return
    try {
      await navigator.clipboard.writeText(folder)
      toast({ tone: 'ok', message: 'Folder path copied.', hint: folder })
    } catch {
      toast({ tone: 'info', message: 'The clips folder is', hint: folder })
    }
  }
  const captionPicked = () => {
    const todo = pickedClips.filter((c) => !c.has_captions)
    if (todo.length === 0) {
      toast({ tone: 'info', message: 'Every picked clip already has captions.' })
      return
    }
    void act(
      'caption',
      async () => {
        await Promise.all(todo.map((c) => api.makeCaptions(c.id)))
        data.reloadJobs()
      },
      {
        success:
          todo.length === 1
            ? 'Making captions in the background.'
            : `Making captions for ${todo.length} clips in the background.`,
      },
    )
  }
  const ffmpegMissing = overview.data ? !overview.data.ffmpeg_ready : false
  // A clip to open as soon as the list has it (just made, or just renamed).
  const [want, setWant] = useState<string | null>(null)
  useEffect(() => {
    if (want !== null && ids.has(want)) {
      setOpen(want)
      setWant(null)
    }
  }, [want, ids])
  // Until the commit above lands, the wanted clip is already the one shown.
  const openId = want !== null && ids.has(want) ? want : open
  const show = (id: string) => {
    if (ids.has(id)) setOpen(id)
    else {
      data.setQuery('')
      // Opened once the list has it: opening first shows "isn't in the folder" for a moment.
      overview.reload()
      setWant(id)
    }
  }
  return (
    <div className="flex flex-col gap-5">
      {ffmpegMissing && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-panel border border-warn/40 bg-warn-soft p-3.5 text-[15px] text-text"
        >
          <WarningCircle size={20} className="mt-px shrink-0 text-warn" aria-hidden="true" />
          <span>
            <span className="font-bold">FFmpeg isn't installed.</span> Pictures, trims, compilations
            and captions need it. Get it in Settings (it's free), then reload.
          </span>
        </div>
      )}
      <JobsPanel
        jobs={jobs}
        onCancel={(id) =>
          void run('cancel', () => api.cancelJob(id).then(() => data.reloadJobs()), {
            quiet: false,
          })
        }
        onDismiss={(id) =>
          void run('dismiss', () => api.dismissJob(id).then(() => data.reloadJobs()))
        }
        onShow={show}
      />
      {data.jobsError != null && jobs.length === 0 && (
        <p role="status" className="text-[14px] text-text-3">
          The list of running work didn't load. It will show here when it does.
        </p>
      )}
      <section id="clips-library" aria-labelledby="clips-title" className="flex flex-col gap-4">
        <div data-testid="clips-toolbar" className="flex flex-wrap items-center gap-2">
          <h2
            id="clips-title"
            className="mr-1 font-display text-lg font-bold tracking-tight text-text max-sm:order-1"
          >
            Clips
          </h2>
          <div className="relative min-w-0 max-sm:order-3 max-sm:min-w-[9rem] max-sm:flex-1 sm:w-60">
            <MagnifyingGlass
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-3"
            />
            <input
              type="search"
              inputMode="search"
              value={data.query}
              onChange={(e) => data.setQuery(e.target.value)}
              placeholder="Search by name…"
              data-keep-placeholder
              aria-label="Search clips by name"
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-full rounded-control border border-line-strong bg-inset pr-8 pl-8 text-[14.5px] text-text placeholder:text-text-3 hover:border-text-3 focus:border-accent-text focus:shadow-[0_0_0_3px_var(--fc-accent-soft)] focus:outline-none"
            />
            {searching && (
              <button
                type="button"
                onClick={() => data.setQuery('')}
                aria-label="Clear the search"
                className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-control text-text-3 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
          <Select
            aria-label="Type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as TypeValue)
              setShown(PAGE)
            }}
            className="h-9! w-32! min-w-0 py-0 max-sm:order-4 text-[14.5px]"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.value === 'all' ? 'Type: All' : t.label}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-2 max-sm:order-2 max-sm:ml-auto">
            <IconButton
              label="Copy the clips folder path"
              size="sm"
              variant="outline"
              onClick={() => void copyFolder()}
              disabled={!overview.data}
            >
              <FolderSimple size={18} aria-hidden="true" />
            </IconButton>
            <IconButton
              label="Reload the clips"
              size="sm"
              variant="outline"
              onClick={() => overview.reload()}
              aria-busy={overview.loading && overview.data !== null}
            >
              <ArrowsClockwise
                size={18}
                aria-hidden="true"
                className={cx(overview.loading && overview.data !== null && 'animate-spin')}
              />
            </IconButton>
          </div>
          {live.length > 0 ? (
            <div
              role="group"
              aria-label="Selected clips"
              className="flex flex-wrap items-center gap-2 max-sm:order-5 max-sm:w-full sm:ml-auto"
            >
              <span
                className="text-[14px] font-semibold text-text-2 max-sm:basis-full"
                aria-live="polite"
              >
                {live.length} selected · {total}
              </span>
              <Button
                size="sm"
                variant="primary"
                icon={<Stack size={16} aria-hidden="true" />}
                disabled={live.length < 2}
                title={live.length < 2 ? 'Pick at least two clips' : undefined}
                onClick={() => setCompiling(true)}
              >
                Compile
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={<ClosedCaptioning size={16} aria-hidden="true" />}
                disabled={!ffmpegReady}
                title={ffmpegReady ? undefined : "Captions need FFmpeg, which isn't installed"}
                onClick={captionPicked}
              >
                Caption
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={<UploadSimple size={16} aria-hidden="true" />}
                disabled={live.length !== 1}
                title={live.length !== 1 ? 'Pick one clip to send to YouTube' : undefined}
                onClick={() => {
                  const only = live[0]
                  if (live.length === 1 && only) {
                    setOpenSection('youtube')
                    setOpen(only)
                  }
                }}
              >
                Upload<span className="sr-only"> to YouTube</span>
                <span className="max-md:hidden" aria-hidden="true">
                  {' '}
                  to YouTube
                </span>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPicked([])}>
                Clear
              </Button>
            </div>
          ) : (
            overview.data && (
              <span
                className="text-[14px] text-text-3 max-sm:order-5 sm:ml-auto"
                aria-live="polite"
              >
                {shownClips.length} {shownClips.length === 1 ? 'clip' : 'clips'}
              </span>
            )
          )}
        </div>
        {overview.error != null && overview.data === null ? (
          <LoadError error={overview.error} onRetry={overview.reload} />
        ) : overview.data === null ? (
          <SkeletonGrid />
        ) : clips.length === 0 ? (
          searching ? (
            <div className="flex flex-col items-start gap-2 py-6">
              <p className="text-[16px] font-bold text-text">No clip is called that.</p>
              <p className="text-[14.5px] text-text-3">Try a shorter word, or clear the search.</p>
              <Button size="sm" variant="outline" onClick={() => data.setQuery('')}>
                Clear the search
              </Button>
            </div>
          ) : (
            <EmptyLibrary onFolder={() => void copyFolder()} />
          )
        ) : shownClips.length === 0 ? (
          <div className="flex flex-col items-start gap-2 py-6">
            <p className="text-[16px] font-bold text-text">No clips of that type.</p>
            <p className="text-[14.5px] text-text-3">Pick another type to see the rest.</p>
            <Button size="sm" variant="outline" onClick={() => setType('all')}>
              Show all types
            </Button>
          </div>
        ) : (
          <ul aria-label="Clips" className={cx(WALL, overview.loading && 'opacity-80')}>
            {shownClips.slice(0, shown).map((c) => (
              <ClipCard
                key={c.id}
                api={api}
                clip={c}
                ffmpegReady={overview.data?.ffmpeg_ready ?? true}
                now={now}
                selected={live.includes(c.id)}
                order={live.indexOf(c.id) + 1}
                onOpen={() => {
                  setOpenSection(undefined)
                  setOpen(c.id)
                }}
                onToggle={() => pick(c.id)}
              />
            ))}
          </ul>
        )}
        {shownClips.length > shown && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>
              Show {Math.min(PAGE, shownClips.length - shown)} more
            </Button>
          </div>
        )}
        {overview.error != null && overview.data !== null && (
          <p role="alert" className="text-[14px] font-semibold text-danger">
            The list couldn't be refreshed. What's shown may be out of date.
          </p>
        )}
      </section>
      {openId !== null && (
        <ClipDialog
          key={openId}
          api={api}
          clip={clips.find((c) => c.id === openId) ?? null}
          id={openId}
          ffmpegReady={overview.data?.ffmpeg_ready ?? true}
          youtubeConnected={overview.data?.youtube_connected ?? false}
          jobs={jobs}
          onJobStarted={() => data.reloadJobs()}
          onChanged={() => overview.reload()}
          onRenamed={(id) => {
            // The new name may not match what is searched: cleared (as `show` does), so the
            // renamed clip is in the list when the dialog looks.
            data.setQuery('')
            overview.reload()
            setWant(id)
          }}
          initialSection={openSection}
          onClose={() => setOpen(null)}
          onDeleted={() => {
            setOpen(null)
            setPicked((p) => p.filter((x) => x !== open))
            overview.reload()
          }}
        />
      )}
      {compiling && (
        <CompileDialog
          api={api}
          clips={live
            .map((id) => known.get(id) ?? clips.find((c) => c.id === id))
            .filter((c): c is Clip => !!c)}
          onClose={() => setCompiling(false)}
          onStarted={() => {
            setCompiling(false)
            setPicked([])
            data.reloadJobs()
            toast({
              tone: 'info',
              message: 'Compiling in the background.',
              hint: 'Watch it under Working on.',
            })
          }}
          onOrder={(ids) => setPicked(ids)}
        />
      )}
    </div>
  )
}

/** Nothing in the folder yet: what to do, in two columns. */
function EmptyLibrary({ onFolder }: { onFolder: () => void }) {
  const ways = [
    ['Replay buffer', 'Save the last moments on demand while you stream.'],
    ['Mark a Moment', 'Tap Moment during a big play and it is cut for you.'],
    ['Record a session', 'Local recordings land here from your folder.'],
  ] as const
  return (
    <div className="grid gap-4 rounded-panel border border-line bg-surface-1 p-4 shadow-1 md:grid-cols-2 md:items-center">
      <div className="flex flex-col items-start gap-2">
        <FolderSimple size={28} className="text-text-3" aria-hidden="true" />
        <p className="text-[16px] font-bold text-text">No clips yet.</p>
        <p className="max-w-[48ch] text-[14.5px] text-text-3">
          Save a replay while you stream, mark a Moment, or record. They show up here from your
          recordings folder.
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={<Record size={16} aria-hidden="true" />}
            onClick={() => go({ name: 'studio', section: 'golive' })}
          >
            Turn on replay buffer
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<FolderSimple size={16} aria-hidden="true" />}
            onClick={onFolder}
          >
            Copy folder path
          </Button>
        </div>
      </div>
      <ul aria-label="Ways to make clips" className="flex flex-col gap-2">
        {ways.map(([t, d], i) => (
          <li key={t} className="flex items-start gap-2.5 rounded-control bg-surface-2 p-2.5">
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-extrabold text-on-accent"
            >
              {i + 1}
            </span>
            <span className="text-[14px] text-text-2">
              <span className="font-bold text-text">{t}.</span> {d}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

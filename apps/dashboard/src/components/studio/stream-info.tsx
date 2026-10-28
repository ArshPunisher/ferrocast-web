// One stream-info form for Twitch, YouTube and Kick, with presets and history. Each
// platform answers for itself; a platform that needs reconnecting says so with a link.
// Owner's pick 6 (24 Oct board, item 8): tabs Everywhere / Twitch / YouTube / Kick. A platform
// tab holds only what's different there (a dot marks it), and Everywhere lists those changes.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { FloppyDisk, ImageSquare, PaperPlaneTilt, UploadSimple, X } from '@phosphor-icons/react'
import {
  ApiError,
  checkStreamInfo,
  describeError,
  relativeTime,
  MAX_STREAM_DESCRIPTION,
  STREAM_INFO_PLATFORMS,
  type CategoryHit,
  type CategoryIds,
  type ChatPlatform,
  type Media,
  type PlatformResult,
  type StreamInfo,
  type StreamInfoView,
  type StreamPreset,
  type PlatformAccess,
  type StreamHistoryEntry,
  streamInfoFor,
} from '@ferrocast/api'
import {
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  PlatformMark,
  Select,
  Skeleton,
  Switch,
  Textarea,
  cx,
  toast,
} from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { previewMediaUrl } from '../../lib/media-url'
import { useAction, useClient, useNow, useResource, type Resource } from '../../lib/hooks'
import { PLATFORM_LABEL, StatusIcon, useStudio } from './common'

const LANGUAGES: [string, string][] = [
  ['', 'Keep as it is'],
  ['en', 'English'],
  ['hi', 'Hindi'],
  ['es', 'Spanish'],
  ['pt', 'Portuguese'],
  ['de', 'German'],
  ['fr', 'French'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['ta', 'Tamil'],
  ['te', 'Telugu'],
  ['bn', 'Bengali'],
  ['other', 'Other'],
]

/** A platform's own fields; empty means "same as everywhere". */
interface Own {
  title: string
  category: string
  categoryIds: CategoryIds
  tags: string
  language: string
}

const NO_OWN: Own = { title: '', category: '', categoryIds: {}, tags: '', language: '' }

type Tab = 'all' | ChatPlatform

interface Form {
  title: string
  category: string
  categoryIds: CategoryIds
  tags: string
  language: string
  /** YouTube only. `null` leaves it as it is. */
  description: string | null
  /** A media library id; YouTube only. */
  thumbnail: string | null
  own: Partial<Record<ChatPlatform, Own>>
}

const EMPTY: Form = {
  title: '',
  category: '',
  categoryIds: {},
  tags: '',
  language: '',
  description: null,
  thumbnail: null,
  own: {},
}

/** YouTube's own thumbnail limits. */
const THUMB_TYPES = ['image/png', 'image/jpeg']
/** YouTube's thumbnail limit (thumbnails.set, checked 28 Oct 2026; it was 2 MB before). */
const THUMB_MAX = 50 * 1024 * 1024

/** A smaller JPEG of a picture, for one over YouTube's limit: at most 4K (YouTube's own
 * recommendation), then 1080p if that's still too big. Null when the browser can't read it. */
async function shrinkPicture(f: File): Promise<File | null> {
  const bitmap = await createImageBitmap(f).catch(() => null)
  if (!bitmap) return null
  try {
    for (const [maxW, quality] of [
      [3840, 0.9],
      [1920, 0.85],
      [1280, 0.8],
    ] as const) {
      const k = Math.min(1, maxW / bitmap.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * k)
      canvas.height = Math.round(bitmap.height * k)
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', quality))
      if (blob && blob.size <= THUMB_MAX) {
        const name = f.name.replace(/\.[^.]+$/, '') + '.jpg'
        return new File([blob], name, { type: 'image/jpeg' })
      }
    }
    return null
  } finally {
    bitmap.close()
  }
}
const isThumbName = (n: string) => /\.(png|jpe?g)$/i.test(n)

function toOwn(i: StreamInfo): Own {
  return {
    title: i.title ?? '',
    category: i.category?.name ?? '',
    categoryIds: i.category?.ids ?? {},
    tags: (i.tags ?? []).join(', '),
    language: i.language ?? '',
  }
}

function toForm(i: StreamInfo): Form {
  const own: Form['own'] = {}
  for (const p of STREAM_INFO_PLATFORMS) {
    const o = i.per?.[p]
    if (o) own[p] = toOwn(o)
  }
  return {
    ...toOwn(i),
    description: i.description ?? null,
    thumbnail: i.thumbnail ?? null,
    own,
  }
}

/** The fields in `o` that are filled in. */
function ownInfo(o: Own): StreamInfo {
  const info: StreamInfo = {}
  if (o.title.trim()) info.title = o.title.trim()
  if (o.category.trim()) info.category = { name: o.category.trim(), ids: o.categoryIds ?? {} }
  if (o.tags.trim())
    info.tags = o.tags
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean)
  if (o.language) info.language = o.language
  return info
}

const hasOwn = (o: Own | undefined): o is Own => !!o && Object.keys(ownInfo(o)).length > 0

function toInfo(f: Form): StreamInfo {
  const info = ownInfo(f)
  // Blank (or only spaces) keeps YouTube's description, as the hint says.
  if (f.description?.trim()) info.description = f.description.trim()
  if (f.thumbnail) info.thumbnail = f.thumbnail
  const per: NonNullable<StreamInfo['per']> = {}
  for (const p of STREAM_INFO_PLATFORMS) {
    const o = f.own[p]
    if (hasOwn(o)) per[p] = ownInfo(o)
  }
  if (Object.keys(per).length > 0) info.per = per
  return info
}

/** One line for a preset or history entry. */
function summary(i: StreamInfo): string {
  const own = STREAM_INFO_PLATFORMS.find((p) => i.per?.[p]?.title)
  return (
    i.title ??
    (own ? `${PLATFORM_LABEL[own]}: ${i.per?.[own]?.title}` : undefined) ??
    i.category?.name ??
    (i.description !== undefined || i.thumbnail
      ? 'YouTube description or thumbnail'
      : 'Tags and language')
  )
}

/** Everywhere / Twitch / YouTube / Kick, as tabs (arrow keys move between them). */
function InfoTabs({
  tab,
  onTab,
  changed,
  panelId,
}: {
  tab: Tab
  onTab: (t: Tab) => void
  changed: (p: ChatPlatform) => boolean
  panelId: string
}) {
  const tabs: Tab[] = ['all', ...STREAM_INFO_PLATFORMS]
  const onKey = (e: KeyboardEvent) => {
    const i = tabs.indexOf(tab)
    const next =
      e.key === 'ArrowRight'
        ? tabs[(i + 1) % tabs.length]
        : e.key === 'ArrowLeft'
          ? tabs[(i + tabs.length - 1) % tabs.length]
          : undefined
    if (!next) return
    e.preventDefault()
    onTab(next)
    document.getElementById(`${panelId}-tab-${next}`)?.focus()
  }
  return (
    <div
      role="tablist"
      aria-label="Which platform"
      className="-mx-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-1 [scrollbar-width:none]"
      onKeyDown={onKey}
    >
      {tabs.map((t) => {
        const on = t === tab
        return (
          <button
            key={t}
            id={`${panelId}-tab-${t}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={panelId}
            tabIndex={on ? 0 : -1}
            onClick={() => onTab(t)}
            className={cx(
              '-mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-2.5 text-[14.5px] font-semibold whitespace-nowrap transition-colors focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
              on ? 'border-accent text-text' : 'border-transparent text-text-3 hover:text-text-2',
            )}
          >
            {t !== 'all' && (
              <span aria-hidden="true" className="inline-flex">
                <PlatformMark platform={t} size={14} />
              </span>
            )}
            {t === 'all' ? 'Everywhere' : PLATFORM_LABEL[t]}
            {t !== 'all' && changed(t) && (
              <>
                <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                <span className="sr-only">(has its own)</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Under an Everywhere field: which platforms use their own value instead. */
function OwnLines({
  own,
  field,
  onEdit,
}: {
  own: Form['own']
  field: 'title' | 'category' | 'tags' | 'language'
  onEdit: (p: ChatPlatform) => void
}) {
  const lines = STREAM_INFO_PLATFORMS.flatMap((p) => {
    const v = own[p]?.[field].trim()
    return v
      ? [{ p, v: field === 'language' ? (LANGUAGES.find(([c]) => c === v)?.[1] ?? v) : v }]
      : []
  })
  if (lines.length === 0) return null
  return (
    <ul className="flex flex-col gap-1 border-l-2 border-line pl-3">
      {lines.map(({ p, v }) => (
        <li key={p} className="flex min-w-0 items-center gap-2 text-[14px] text-text-3">
          <span aria-hidden="true" className="inline-flex shrink-0">
            <PlatformMark platform={p} size={13} />
          </span>
          <span className="min-w-0 truncate">
            {PLATFORM_LABEL[p]} uses its own: <span className="text-text-2">“{v}”</span>
          </span>
          <button
            type="button"
            className="shrink-0 font-semibold text-accent-text hover:underline focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
            onClick={() => onEdit(p)}
          >
            Edit
            <span className="sr-only">
              {' '}
              {PLATFORM_LABEL[p]}’s {field}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** "Use the everywhere title" beside a platform's own value. */
function UseEverywhere({
  show,
  label,
  onClick,
}: {
  show: boolean
  label: string
  onClick: () => void
}) {
  if (!show) return null
  return (
    <button
      type="button"
      className="self-start text-[14px] font-semibold text-accent-text hover:underline focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
      onClick={onClick}
    >
      Use the everywhere {label}
    </button>
  )
}

/**
 * The YouTube thumbnail: a JPEG or PNG from the media library (or a new upload), with a
 * 16:9 preview. Twitch and Kick make their own from the stream.
 */
function ThumbnailPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (id: string | null) => void
}) {
  const client = useClient()
  const media = useResource((c) => c.media())
  const file = useRef<HTMLInputElement>(null)
  const { run, busy } = useAction()
  const list = (media.data ?? []).filter((m) => m.kind === 'image' && isThumbName(m.name))
  const picked = list.find((m) => m.id === value)
  const upload = (f: File) => {
    if (!THUMB_TYPES.includes(f.type) && !isThumbName(f.name)) {
      toast({
        tone: 'error',
        message: 'YouTube thumbnails must be a JPEG or PNG picture.',
        hint: 'Save it as .jpg or .png, then try again.',
      })
      return
    }
    if (f.size > THUMB_MAX) {
      toast({
        tone: 'error',
        message: `That picture is ${(f.size / 1024 / 1024).toFixed(1)} MB. YouTube takes up to 50 MB.`,
        hint: 'Make it smaller here, or save it smaller and try again.',
        action: {
          label: 'Make it smaller',
          run: () =>
            void shrinkPicture(f).then((small) =>
              small
                ? upload(small)
                : toast({
                    tone: 'error',
                    message: 'That picture couldn’t be made smaller here.',
                    hint: 'Save it as a JPEG of 1920 × 1080 or less, then try again.',
                  }),
            ),
        },
      })
      return
    }
    void run('upload', () => client.upload(f, f.name), {
      success: (m: Media) => `${m.name} uploaded.`,
    }).then((m) => {
      if (!m) return
      media.set([...(media.data ?? []), m])
      onChange(m.id)
    })
  }
  return (
    <Field
      label="Thumbnail"
      optional
      hint="YouTube only. JPEG or PNG up to 50 MB, 16:9 (1280 × 720 or bigger). Needs a verified channel."
    >
      {(p) => (
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start">
          <div className="grid aspect-video w-full max-w-60 shrink-0 place-items-center overflow-hidden rounded-control border border-line bg-surface-2 sm:w-44">
            {picked ? (
              <img
                src={previewMediaUrl(client, media.data, picked.id) ?? undefined}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <ImageSquare size={26} className="text-text-3" aria-hidden="true" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Select {...p} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
              <option value="">Keep YouTube’s thumbnail</option>
              {value && !picked && <option value={value}>Picture no longer in the library</option>}
              {list.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                icon={<UploadSimple size={15} />}
                busy={busy === 'upload'}
                onClick={() => file.current?.click()}
              >
                Upload a picture
              </Button>
              {value && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<X size={14} />}
                  onClick={() => onChange(null)}
                >
                  Don’t change it
                </Button>
              )}
            </div>
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) upload(f)
              }}
            />
          </div>
        </div>
      )}
    </Field>
  )
}

/** "description: Twitch has no stream description" → the field and why. */
function skipParts(s: string): { field: string; why: string } {
  const i = s.indexOf(':')
  return i > 0 ? { field: s.slice(0, i).trim(), why: s.slice(i + 1).trim() } : { field: s, why: '' }
}

/** What each platform took, as a card each: what changed, what it doesn't have, or why it
 * refused and what to do. */
function Results({ results }: { results: PlatformResult[] }) {
  return (
    <ul
      className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3"
      aria-label="What each platform said"
    >
      {results.map((r) => (
        <li
          key={r.platform}
          className={cx(
            'flex flex-col gap-2.5 rounded-[12px] border p-3.5',
            r.ok ? 'border-line bg-surface-2' : 'border-transparent bg-danger-soft',
          )}
        >
          <p className="m-0 flex items-center gap-2 text-[15px] font-bold text-text">
            <PlatformMark platform={r.platform} size={15} />
            {PLATFORM_LABEL[r.platform]}
            <span
              className={cx(
                'ml-auto inline-flex items-center gap-1 text-[13px] font-bold',
                r.waiting ? 'text-accent-text' : r.ok ? 'text-ok' : 'text-danger',
              )}
            >
              <StatusIcon status={r.waiting ? 'waiting' : r.ok ? 'done' : 'failed'} />
              {r.waiting ? 'When you go live' : r.ok ? 'Updated' : 'Not updated'}
            </span>
          </p>
          {r.waiting && (
            <p className="m-0 text-[13.5px] leading-snug text-text-2">
              Saved. YouTube makes your live video when the stream starts; Ferrocast puts these on
              it then. No need to schedule anything.
            </p>
          )}
          {r.ok && r.applied.length > 0 && (
            <div
              className="flex flex-wrap gap-1.5"
              aria-label={r.waiting ? 'Will change' : 'Changed'}
            >
              {r.applied.map((f) => (
                <span
                  key={f}
                  className={cx(
                    'rounded-full px-2.5 py-0.5 text-[13px] font-semibold capitalize',
                    r.waiting ? 'bg-accent-soft text-accent-text' : 'bg-ok-soft text-ok',
                  )}
                >
                  {f}
                </span>
              ))}
            </div>
          )}
          {r.error && (
            <p className="m-0 text-[14px] leading-snug break-words text-text">
              {r.error.message}{' '}
              {r.error.code === 'reconnect_needed' || r.error.code === 'not_connected' ? (
                <a
                  href="#/settings/accounts"
                  className="font-semibold text-accent-text underline-offset-2 hover:underline"
                >
                  Open Accounts
                </a>
              ) : (
                <span className="text-text-2">{r.error.hint}</span>
              )}
            </p>
          )}
          {r.skipped.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[12.5px] font-bold text-text-3">
                {PLATFORM_LABEL[r.platform]} doesn&apos;t take
              </span>
              <div className="flex flex-wrap gap-1.5">
                {r.skipped.map((x) => {
                  const { field, why } = skipParts(x)
                  return (
                    <span
                      key={x}
                      title={why}
                      className="rounded-full border border-line px-2.5 py-0.5 text-[13px] font-semibold text-text-3 capitalize"
                    >
                      {field}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

/** A platform tab: only what's different there. Empty fields use the Everywhere tab. */
function PlatformFields({
  platform,
  own,
  everywhere,
  supports,
  hits,
  searchOn,
  listId,
  onChange,
}: {
  platform: ChatPlatform
  own: Own
  everywhere: Form
  supports: StreamInfoView['platforms'][number]['supports'] | undefined
  hits: CategoryHit[]
  searchOn: ChatPlatform | undefined
  listId: string
  onChange: (o: Own) => void
}) {
  const name = PLATFORM_LABEL[platform]
  const max = platform === 'youtube' ? 100 : 140
  const same = (v: string) => (v.trim() ? `Same as everywhere: ${v.trim()}` : 'Same as everywhere')
  const everywhereLanguage = LANGUAGES.find(([c]) => c === everywhere.language)?.[1] ?? ''
  return (
    <>
      <p className="text-[14.5px] text-text-3">
        Only what’s different on {name}. Empty fields use the Everywhere tab.
      </p>
      <Field
        label="Title"
        optional
        hintVisible
        hint={own.title ? `${[...own.title].length} of ${max}` : `${name} takes up to ${max}.`}
      >
        {(p) => (
          <div className="flex flex-col gap-1.5">
            <Input
              {...p}
              maxLength={140}
              placeholder={same(everywhere.title)}
              value={own.title}
              onChange={(e) => onChange({ ...own, title: e.target.value })}
            />
            <UseEverywhere
              show={!!own.title}
              label="title"
              onClick={() => onChange({ ...own, title: '' })}
            />
          </div>
        )}
      </Field>
      {supports?.category !== false && (
        <Field
          label={platform === 'youtube' ? 'Video category' : 'Category'}
          optional
          hint={
            platform === 'youtube'
              ? 'YouTube takes a video category; a game becomes Gaming.'
              : searchOn
                ? `Suggestions from ${PLATFORM_LABEL[searchOn]}.`
                : 'Connect a platform to search.'
          }
        >
          {(p) => (
            <div className="flex flex-col gap-1.5">
              <Input
                {...p}
                list={listId}
                placeholder={same(everywhere.category)}
                value={own.category}
                onChange={(e) => {
                  const v = e.target.value
                  const hit = hits.find((h) => h.name === v)
                  onChange({
                    ...own,
                    category: v,
                    categoryIds: hit && searchOn ? { [searchOn]: hit.id } : {},
                  })
                }}
              />
              <datalist id={listId}>
                {hits.map((h) => (
                  <option key={h.id} value={h.name} />
                ))}
              </datalist>
              <UseEverywhere
                show={!!own.category}
                label="category"
                onClick={() => onChange({ ...own, category: '', categoryIds: {} })}
              />
            </div>
          )}
        </Field>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {supports?.tags !== false && (
          <Field label="Tags" optional hint="Comma separated, up to 10.">
            {(p) => (
              <div className="flex flex-col gap-1.5">
                <Input
                  {...p}
                  placeholder={same(everywhere.tags)}
                  value={own.tags}
                  onChange={(e) => onChange({ ...own, tags: e.target.value })}
                />
                <UseEverywhere
                  show={!!own.tags}
                  label="tags"
                  onClick={() => onChange({ ...own, tags: '' })}
                />
              </div>
            )}
          </Field>
        )}
        {supports?.language !== false && (
          <Field label="Language" optional>
            {(p) => (
              <Select
                {...p}
                value={own.language}
                onChange={(e) => onChange({ ...own, language: e.target.value })}
              >
                <option value="">
                  {same(everywhereLanguage === 'Keep as it is' ? '' : everywhereLanguage)}
                </option>
                {LANGUAGES.filter(([c]) => c).map(([code, l]) => (
                  <option key={code} value={code}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </div>
      {platform === 'youtube' && (
        <p className="text-[14.5px] text-text-3">
          The description and thumbnail are on the Everywhere tab; only YouTube takes them.
        </p>
      )}
      {platform !== 'youtube' && (
        <p className="text-[14.5px] text-text-3">
          No thumbnail here: {PLATFORM_LABEL[platform]} doesn’t let apps set one. It takes a picture
          from your stream by itself.
        </p>
      )}
    </>
  )
}

export function StreamInfoEditor({ view }: { view: Resource<StreamInfoView> }) {
  const studio = useStudio()
  const now = useNow(30_000)
  const [form, setForm] = useState<Form>(EMPTY)
  const [picked, setPicked] = useState<ChatPlatform[] | null>(null)
  const [results, setResults] = useState<PlatformResult[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [hits, setHits] = useState<CategoryHit[]>([])
  const [naming, setNaming] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const { run, busy } = useAction()
  const listId = useId()
  const panelId = useId()
  const v = view.data
  // Start from what was sent last, once.
  const [seeded, setSeeded] = useState(false)
  if (v && !seeded) {
    setSeeded(true)
    if (v.last) setForm(toForm(v.last.info))
  }
  const connected = v?.platforms.filter((p) => p.connected).map((p) => p.platform) ?? []
  const targets = picked ?? connected
  const anySearch = (
    v?.platforms.find((p) => p.connected && p.platform !== 'youtube') ??
    v?.platforms.find((p) => p.connected)
  )?.platform
  // A platform tab searches that platform's own categories when it's connected.
  const searchOn =
    tab !== 'all' && v?.platforms.some((p) => p.platform === tab && p.connected) ? tab : anySearch
  const own = tab === 'all' ? null : (form.own[tab] ?? NO_OWN)
  const query = (own ? own.category : form.category).trim()

  useEffect(() => {
    if (!searchOn || query.length < 2) {
      setHits([])
      return
    }
    const t = setTimeout(() => {
      studio
        .categories(searchOn, query)
        .then((r) => setHits(r.items))
        .catch(() => setHits([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query, searchOn, studio])

  if (view.error) return <LoadError error={view.error} onRetry={view.reload} />
  if (!v) return <Skeleton className="h-80" />

  const send = () => {
    const info = toInfo(form)
    const problem = checkStreamInfo(info)
    setErr(problem)
    if (problem) return
    void run(
      'send',
      async () => {
        try {
          const r = await studio.applyStreamInfo(info, targets)
          setResults(r.results)
          view.reload()
          toast(
            r.failed === 0
              ? {
                  tone: 'ok',
                  message: `Updated on ${r.results.map((x) => PLATFORM_LABEL[x.platform]).join(', ')}.`,
                }
              : {
                  tone: 'warn',
                  message: `Updated on ${r.ok} of ${r.results.length}.`,
                  hint: 'See what each platform said.',
                },
          )
          return r
        } catch (e) {
          // Nobody took it: the details are in the newest history entry.
          if (e instanceof ApiError && e.code === 'stream_info_failed') {
            const fresh = await studio.streamInfo()
            view.set(fresh)
            setResults(fresh.history[0]?.results ?? null)
          }
          setErr(describeError(e).message)
          throw e
        }
      },
      { quiet: true },
    )
  }
  const savePreset = () => {
    const info = toInfo(form)
    const problem = checkStreamInfo(info)
    if (problem) return setErr(problem)
    const name = (naming ?? '').trim()
    if (!name) return setErr('Give the preset a name.')
    void run('preset', () => studio.createPreset(name, info), { success: `Saved “${name}”.` }).then(
      (p) => {
        if (!p) return
        view.set({ ...v, presets: [...v.presets, p] })
        setNaming(null)
      },
    )
  }
  const titleLen = [...form.title].length
  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Panel title="Stream info" description="Typed once, sent to every platform you tick.">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <PresetChips
            presets={v.presets}
            onPick={(p) => {
              setForm(toForm(p.info))
              setResults(null)
              toast({
                tone: 'info',
                message: `Filled in “${p.name}”.`,
                hint: 'Press Update everywhere to send it, or it goes when you go live.',
              })
            }}
            onDelete={(p) =>
              void run(
                'del',
                async () => {
                  await studio.deletePreset(p.id)
                  view.set({ ...v, presets: v.presets.filter((x) => x.id !== p.id) })
                  return true
                },
                { success: `Deleted “${p.name}”.` },
              )
            }
          />
          <InfoTabs
            tab={tab}
            onTab={(t) => {
              setTab(t)
              setHits([])
            }}
            changed={(p) => hasOwn(form.own[p])}
            panelId={panelId}
          />
          <div
            id={panelId}
            role="tabpanel"
            aria-labelledby={`${panelId}-tab-${tab}`}
            className="flex flex-col gap-4"
          >
            {tab === 'all' ? (
              <>
                <Field
                  label="Title"
                  hintVisible
                  hint={
                    titleLen === 0
                      ? 'Empty: each platform keeps the title it has.'
                      : `${titleLen} of 140 (YouTube takes 100)`
                  }
                >
                  {(p) => (
                    <Input
                      {...p}
                      maxLength={140}
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                    />
                  )}
                </Field>
                <OwnLines own={form.own} field="title" onEdit={setTab} />
                <Field
                  label="Category"
                  optional
                  hint={
                    searchOn
                      ? `Suggestions from ${PLATFORM_LABEL[searchOn]}.`
                      : 'Connect a platform to search.'
                  }
                >
                  {(p) => (
                    <>
                      <Input
                        {...p}
                        list={listId}
                        value={form.category}
                        onChange={(e) => {
                          const name = e.target.value
                          const hit = hits.find((h) => h.name === name)
                          setForm({
                            ...form,
                            category: name,
                            categoryIds: hit && searchOn ? { [searchOn]: hit.id } : {},
                          })
                        }}
                      />
                      <datalist id={listId}>
                        {hits.map((h) => (
                          <option key={h.id} value={h.name} />
                        ))}
                      </datalist>
                    </>
                  )}
                </Field>
                <OwnLines own={form.own} field="category" onEdit={setTab} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="Tags"
                    optional
                    hint="Comma separated, up to 10, letters and numbers."
                  >
                    {(p) => (
                      <Input
                        {...p}
                        value={form.tags}
                        onChange={(e) => setForm({ ...form, tags: e.target.value })}
                      />
                    )}
                  </Field>
                  <Field label="Language" optional>
                    {(p) => (
                      <Select
                        {...p}
                        value={form.language}
                        onChange={(e) => setForm({ ...form, language: e.target.value })}
                      >
                        {LANGUAGES.map(([code, l]) => (
                          <option key={code} value={code}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                </div>
                <OwnLines own={form.own} field="tags" onEdit={setTab} />
                <OwnLines own={form.own} field="language" onEdit={setTab} />
                <Field
                  label="Description"
                  optional
                  hint={
                    form.description === null
                      ? 'YouTube only. Empty keeps YouTube’s description.'
                      : `YouTube only. ${[...form.description].length} of ${MAX_STREAM_DESCRIPTION}.`
                  }
                >
                  {(p) => (
                    <Textarea
                      {...p}
                      rows={4}
                      maxLength={MAX_STREAM_DESCRIPTION}
                      value={form.description ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          description: e.target.value === '' ? null : e.target.value,
                        })
                      }
                    />
                  )}
                </Field>
                <ThumbnailPicker
                  value={form.thumbnail}
                  onChange={(thumbnail) => setForm({ ...form, thumbnail })}
                />
              </>
            ) : (
              own && (
                <PlatformFields
                  platform={tab}
                  own={own}
                  everywhere={form}
                  supports={v.platforms.find((p) => p.platform === tab)?.supports}
                  hits={hits}
                  searchOn={searchOn}
                  listId={listId}
                  onChange={(o) => setForm({ ...form, own: { ...form.own, [tab]: o } })}
                />
              )
            )}
          </div>
          {err && (
            <p role="alert" className="text-[14.5px] font-medium text-danger">
              {err}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="primary"
              icon={<PaperPlaneTilt size={15} weight="fill" />}
              busy={busy === 'send'}
              disabled={targets.length === 0}
            >
              Update everywhere
            </Button>
            {naming === null && (
              <Button
                icon={<FloppyDisk size={15} />}
                onClick={() => setNaming(form.category.trim())}
              >
                Save as preset
              </Button>
            )}
          </div>
          {naming !== null && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Preset name" className="min-w-0 flex-1">
                {(p) => (
                  <Input
                    {...p}
                    autoFocus
                    data-autofocus
                    maxLength={60}
                    value={naming}
                    onChange={(e) => setNaming(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        savePreset()
                      }
                    }}
                  />
                )}
              </Field>
              <Button variant="ghost" onClick={() => setNaming(null)}>
                Cancel
              </Button>
              <Button busy={busy === 'preset'} onClick={savePreset}>
                Save preset
              </Button>
            </div>
          )}
          {results && <Results results={results} />}
        </form>
      </Panel>
      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-[14.5px] font-bold text-text-2">What each platform will show</h3>
        {v.platforms.map((p) => (
          <PlatformCard
            key={p.platform}
            access={p}
            info={streamInfoFor(toInfo(form), p.platform)}
            sending={p.connected && targets.includes(p.platform)}
            last={v.history.find((h) => h.results.some((r) => r.platform === p.platform && r.ok))}
            onSending={() =>
              setPicked(
                targets.includes(p.platform)
                  ? targets.filter((x) => x !== p.platform)
                  : [...targets, p.platform],
              )
            }
          />
        ))}
        <Panel title="Last sent">
          {v.history.length === 0 ? (
            <p className="text-[14.5px] text-text-3">Nothing sent from Ferrocast yet.</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {v.history.slice(0, 5).map((h) => (
                <li key={h.at}>
                  <button
                    type="button"
                    className="w-full rounded-control px-2 py-2 text-left hover:bg-surface-2"
                    onClick={() => setForm(toForm(h.info))}
                  >
                    <span className="block truncate text-sm text-text">{summary(h.info)}</span>
                    <span className="block text-[14.5px] text-text-3">
                      {relativeTime(h.at, now)} · {h.results.filter((r) => r.ok).length} of{' '}
                      {h.results.length} platforms
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

/** Presets as one-click chips over the form (owner's pick S1); right-click or the × removes one. */
function PresetChips({
  presets,
  onPick,
  onDelete,
}: {
  presets: StreamPreset[]
  onPick: (p: StreamPreset) => void
  onDelete: (p: StreamPreset) => void
}) {
  if (presets.length === 0)
    return (
      <p className="m-0 text-[14px] text-text-3">
        Presets: none yet. Fill the form, then Save as preset to fill it in one click next time.
      </p>
    )
  return (
    <ul aria-label="Presets" className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
      <li className="mr-1 text-[14px] font-semibold text-text-3">Presets</li>
      {presets.map((p) => (
        <li key={p.id} className="flex items-center rounded-full bg-surface-3">
          <button
            type="button"
            title={summary(p.info)}
            onClick={() => onPick(p)}
            className="max-w-[220px] truncate rounded-l-full py-1 pr-1 pl-3 text-[13.5px] font-bold text-text hover:text-accent-text"
          >
            {p.name}
          </button>
          <IconButton
            size="sm"
            variant="ghost"
            label={`Delete ${p.name}`}
            className="size-7! rounded-full! text-text-3"
            onClick={() => onDelete(p)}
          >
            <X size={12} weight="bold" />
          </IconButton>
        </li>
      ))}
    </ul>
  )
}

/** One platform: whether it gets the form (its switch), what it will show, or that it keeps
 * what it has when nothing's filled in, and what Ferrocast sent it last. */
function PlatformCard({
  access,
  info,
  sending,
  last,
  onSending,
}: {
  access: PlatformAccess
  info: StreamInfo
  sending: boolean
  last: StreamHistoryEntry | undefined
  onSending: () => void
}) {
  const name = PLATFORM_LABEL[access.platform] ?? access.platform
  const title = info.title?.trim() ?? ''
  const category = info.category?.name?.trim() ?? ''
  const anything = !!title || !!category || (info.tags?.length ?? 0) > 0
  const cut = access.platform === 'youtube' && [...title].length > 100
  const lastTitle = last ? streamInfoFor(last.info, access.platform).title : undefined
  const state = !access.connected
    ? { tone: 'neutral' as const, text: 'Not connected' }
    : access.needs
      ? { tone: 'warn' as const, text: 'Reconnect needed' }
      : !sending
        ? { tone: 'neutral' as const, text: 'Not sent' }
        : !anything
          ? { tone: 'neutral' as const, text: 'Keeps its own' }
          : cut
            ? { tone: 'warn' as const, text: 'Title cut to 100' }
            : { tone: 'ok' as const, text: 'Will update' }
  return (
    <section
      aria-label={name}
      className="rounded-panel border border-line bg-surface-1 px-4 py-3.5"
    >
      <div className="flex items-center gap-2.5">
        <PlatformMark platform={access.platform} size={18} />
        <span className="font-bold text-text">{name}</span>
        <Badge tone={state.tone}>{state.text}</Badge>
        <span className="flex-1" />
        <Switch
          label={`Send to ${name}`}
          hideLabel
          disabled={!access.connected}
          checked={sending}
          onChange={onSending}
        />
      </div>
      {!access.connected || access.needs ? (
        <p className="m-0 mt-2 text-[14px] text-text-3">
          <a href="#/settings/accounts" className="font-semibold text-accent-text hover:underline">
            {access.connected ? 'Reconnect' : 'Connect'} {name}
          </a>{' '}
          to set its stream info from here.
        </p>
      ) : sending && anything ? (
        <div className="mt-2 text-[14px]">
          {title && (
            <p className="m-0 font-bold break-words text-text">
              {cut ? [...title].slice(0, 100).join('') + '…' : title}
            </p>
          )}
          <p className="m-0 text-text-3">
            {[category, info.tags?.join(', ')].filter(Boolean).join(' · ') || 'Title only'}
          </p>
        </div>
      ) : (
        <p className="m-0 mt-2 text-[14px] text-text-3">
          {lastTitle
            ? `Keeps what it has. Last from Ferrocast: “${lastTitle}”`
            : 'Keeps what it has now.'}
        </p>
      )}
    </section>
  )
}

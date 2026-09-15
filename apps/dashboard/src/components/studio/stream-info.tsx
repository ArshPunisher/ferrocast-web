// One stream-info form for Twitch, YouTube and Kick, with presets and history. Each
// platform answers for itself; a platform that needs reconnecting says so with a link.

import { useEffect, useId, useState } from 'react'
import { FloppyDisk, PaperPlaneTilt, Trash } from '@phosphor-icons/react'
import {
  ApiError,
  checkStreamInfo,
  describeError,
  relativeTime,
  type CategoryHit,
  type CategoryIds,
  type ChatPlatform,
  type PlatformResult,
  type StreamInfo,
  type StreamInfoView,
  type StreamPreset,
} from '@ferrocast/api'
import { Badge, Button, Field, IconButton, Input, Select, Skeleton, toast } from '@ferrocast/ui'
import { LoadError, Panel } from '../Panel'
import { useAction, useNow, type Resource } from '../../lib/hooks'
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

interface Form {
  title: string
  category: string
  categoryIds: CategoryIds
  tags: string
  language: string
}

const EMPTY: Form = { title: '', category: '', categoryIds: {}, tags: '', language: '' }

function toForm(i: StreamInfo): Form {
  return {
    title: i.title ?? '',
    category: i.category?.name ?? '',
    categoryIds: i.category?.ids ?? {},
    tags: (i.tags ?? []).join(', '),
    language: i.language ?? '',
  }
}

function toInfo(f: Form): StreamInfo {
  const info: StreamInfo = {}
  if (f.title.trim()) info.title = f.title.trim()
  if (f.category.trim()) info.category = { name: f.category.trim(), ids: f.categoryIds ?? {} }
  if (f.tags.trim())
    info.tags = f.tags
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean)
  if (f.language) info.language = f.language
  return info
}

function Results({ results }: { results: PlatformResult[] }) {
  return (
    <ul className="flex flex-col gap-2" aria-label="What each platform said">
      {results.map((r) => (
        <li key={r.platform} className="flex items-start gap-2.5 text-sm">
          <StatusIcon status={r.ok ? 'done' : 'failed'} className="mt-0.5" />
          <div className="min-w-0">
            <p className="font-medium text-text">
              {PLATFORM_LABEL[r.platform]}
              {r.ok && (
                <span className="font-normal text-text-3"> updated {r.applied.join(', ')}</span>
              )}
            </p>
            {r.error && (
              <p className="text-[13px] break-words text-text-2">
                {r.error.message}{' '}
                {r.error.code === 'reconnect_needed' || r.error.code === 'not_connected' ? (
                  <a
                    href="#/settings/accounts"
                    className="font-semibold text-accent-text underline-offset-2 hover:underline"
                  >
                    Open Accounts
                  </a>
                ) : (
                  r.error.hint
                )}
              </p>
            )}
            {r.skipped.map((s) => (
              <p key={s} className="text-[12.5px] text-text-3">
                Skipped {s}
              </p>
            ))}
          </div>
        </li>
      ))}
    </ul>
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
  const { run, busy } = useAction()
  const listId = useId()
  const v = view.data
  // Start from what was sent last, once.
  const [seeded, setSeeded] = useState(false)
  if (v && !seeded) {
    setSeeded(true)
    if (v.last) setForm(toForm(v.last.info))
  }
  const connected = v?.platforms.filter((p) => p.connected).map((p) => p.platform) ?? []
  const targets = picked ?? connected
  const searchOn = (
    v?.platforms.find((p) => p.connected && p.platform !== 'youtube') ??
    v?.platforms.find((p) => p.connected)
  )?.platform

  useEffect(() => {
    const q = form.category.trim()
    if (!searchOn || q.length < 2) {
      setHits([])
      return
    }
    const t = setTimeout(() => {
      studio
        .categories(searchOn, q)
        .then((r) => setHits(r.items))
        .catch(() => setHits([]))
    }, 250)
    return () => clearTimeout(t)
  }, [form.category, searchOn, studio])

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
          <Field label="Title" hint={`${titleLen} of 140 (YouTube takes 100)`}>
            {(p) => (
              <Input
                {...p}
                maxLength={140}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            )}
          </Field>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tags" optional hint="Comma separated, up to 10, letters and numbers.">
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
          <fieldset>
            <legend className="text-[13px] font-medium text-text-2">Send to</legend>
            <ul className="mt-2 flex flex-col gap-2">
              {v.platforms.map((p) => (
                <li key={p.platform} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <label className="inline-flex items-center gap-2 text-sm text-text">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--fc-arc)]"
                      disabled={!p.connected}
                      checked={p.connected && targets.includes(p.platform)}
                      onChange={() =>
                        setPicked(
                          targets.includes(p.platform)
                            ? targets.filter((x) => x !== p.platform)
                            : [...targets, p.platform],
                        )
                      }
                    />
                    {PLATFORM_LABEL[p.platform]}
                  </label>
                  {p.needs && (
                    <span className="text-[12.5px] text-text-3">
                      {p.connected ? <Badge tone="warn">Reconnect needed</Badge> : 'Not connected.'}{' '}
                      <a
                        href="#/settings/accounts"
                        className="font-semibold text-accent-text hover:underline"
                      >
                        {p.connected ? 'Reconnect' : 'Connect'}
                      </a>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </fieldset>
          {err && (
            <p role="alert" className="text-[13px] font-medium text-danger">
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
      <div className="flex flex-col gap-5">
        <Panel title="Presets">
          {v.presets.length === 0 ? (
            <p className="text-[13px] text-text-3">
              Save the form as a preset, like “Valorant ranked”, to fill it in one click.
            </p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {v.presets.map((p: StreamPreset) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-control px-2 py-2 hover:bg-surface-2"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setForm(toForm(p.info))
                      setResults(null)
                      toast({
                        tone: 'info',
                        message: `Filled in “${p.name}”.`,
                        hint: 'Press Update everywhere to send it.',
                      })
                    }}
                  >
                    <span className="block truncate text-sm font-semibold text-text">{p.name}</span>
                    <span className="block truncate text-[12.5px] text-text-3">
                      {p.info.title ?? p.info.category?.name}
                    </span>
                  </button>
                  <IconButton
                    size="sm"
                    variant="danger-ghost"
                    label={`Delete ${p.name}`}
                    onClick={() =>
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
                  >
                    <Trash size={15} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Last sent">
          {v.history.length === 0 ? (
            <p className="text-[13px] text-text-3">Nothing sent from Ferrocast yet.</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {v.history.slice(0, 5).map((h) => (
                <li key={h.at}>
                  <button
                    type="button"
                    className="w-full rounded-control px-2 py-2 text-left hover:bg-surface-2"
                    onClick={() => setForm(toForm(h.info))}
                  >
                    <span className="block truncate text-sm text-text">
                      {h.info.title ?? h.info.category?.name ?? 'Tags and language'}
                    </span>
                    <span className="block text-[12.5px] text-text-3">
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

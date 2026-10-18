// Bring your setup from StreamElements or Streamlabs: pick the source, preview what would
// come over (nothing changes yet), choose what happens on clashes, import, read the report.

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ArrowLeft, CheckCircle, FileArrowUp, Info, Warning } from '@phosphor-icons/react'
import {
  PLATFORM_LABEL,
  describeError,
  type ChatPlatform,
  type ConflictChoice,
  type ImportItem,
  type ImportKind,
  type ImportPreview,
  type ImportReport,
  type ImportSource,
  type NotImported,
} from '@ferrocast/api'
import { Badge, Button, Field, Input, Segmented, Select, cx } from '@ferrocast/ui'
import { PageHeader, Panel } from '../components/Panel'
import { useClient } from '../lib/hooks'
import { go, href } from '../lib/router'

/** The demo engine's sample JWT (made up; see packages/api/src/demo/features/importers.ts). */
const DEMO_SE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjaGFubmVsIjoiZGVtbyJ9.ZGVtby1zaWduYXR1cmUtbm90LXJlYWw'
const MAX_FILE = 10 * 1024 * 1024
const ACCEPT =
  '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const KIND_LABEL: Record<ImportKind, string> = {
  commands: 'Commands',
  timers: 'Timers',
  points: 'Points balances',
  loyalty_settings: 'Points settings',
  tips: 'Tip history',
}

const SOURCE_LABEL: Record<ImportSource, string> = {
  streamelements: 'StreamElements',
  streamlabs: 'Streamlabs',
}

const n = (v: number) => v.toLocaleString()

type Failure = { message: string; hint: string | null }

function ErrorNote({ error }: { error: Failure }) {
  return (
    <div
      role="alert"
      className="flex gap-2.5 rounded-control border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13.5px]"
    >
      <Warning size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-medium text-text">{error.message}</p>
        {error.hint && <p className="mt-0.5 text-text-2">{error.hint}</p>}
      </div>
    </div>
  )
}

function Items({ title, items, total }: { title: string; items: ImportItem[]; total: number }) {
  if (total === 0) return null
  return (
    <details className="group mt-2 rounded-control bg-inset px-3 py-2">
      <summary className="cursor-pointer text-[13.5px] font-medium text-text-2 select-none hover:text-text">
        {title} ({n(total)})
      </summary>
      <ul className="mt-2 flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
        {items.map((i, idx) => (
          <li key={`${i.name}-${idx}`} className="text-[13.5px] leading-snug break-words">
            <span className="font-medium text-text">{i.name}</span>
            <span className="text-text-3">: {i.reason}</span>
          </li>
        ))}
        {total > items.length && (
          <li className="text-[13.5px] text-text-3">and {n(total - items.length)} more</li>
        )}
      </ul>
    </details>
  )
}

function Notes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {notes.map((t) => (
        <li key={t} className="flex gap-2 text-[13.5px] leading-snug text-text-2">
          <Info size={15} className="mt-0.5 shrink-0 text-text-3" aria-hidden="true" />
          <span className="min-w-0 break-words">{t}</span>
        </li>
      ))}
    </ul>
  )
}

function Count({ value, label, tone }: { value: number; label: string; tone?: 'warn' | 'ok' }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span
        className={cx(
          'font-mono text-lg leading-none font-semibold tabular-nums',
          value === 0 ? 'text-text-3' : tone === 'warn' ? 'text-warn' : 'text-text',
        )}
      >
        {n(value)}
      </span>
      <span className="mt-1 text-[13.5px] font-medium text-text-2">{label}</span>
    </div>
  )
}

function NotImportedList({ items }: { items: NotImported[] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-5 border-t border-line pt-4">
      <h3 className="text-sm font-semibold text-text">Not brought over</h3>
      <ul className="mt-2 flex flex-col gap-3">
        {items.map((i) => (
          <li key={i.what} className="text-[13.5px] leading-relaxed">
            <span className="font-medium text-text">
              {i.what}
              {i.count > 0 && <span className="text-text-3"> ({n(i.count)})</span>}
            </span>
            <p className="text-text-2">{i.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function FilePick({
  label,
  hint,
  file,
  onPick,
  optional,
}: {
  label: string
  hint: ReactNode
  file: File | null
  onPick: (f: File | null) => void
  optional?: boolean
}) {
  const id = useId()
  const ref = useRef<HTMLInputElement>(null)
  const tooBig = file !== null && file.size > MAX_FILE
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13.5px] font-medium text-text-2">
        {label}
        {optional && <span className="ml-1.5 font-normal text-text-3">optional</span>}
      </label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <input
          ref={ref}
          id={id}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-describedby={`${id}-hint`}
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
        <Button icon={<FileArrowUp size={16} />} onClick={() => ref.current?.click()}>
          {file ? 'Change file' : 'Choose file'}
        </Button>
        {file && (
          <>
            <span className="min-w-0 truncate text-[13.5px] text-text-2" title={file.name}>
              {file.name}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onPick(null)
                if (ref.current) ref.current.value = ''
              }}
            >
              Remove
            </Button>
          </>
        )}
      </div>
      {tooBig ? (
        <p role="alert" className="text-[13px] font-medium text-danger">
          That file is over 10 MB, the most Ferrocast reads. Export only the columns you need.
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-[13px] leading-snug text-text-3">
          {hint}
        </p>
      )}
    </div>
  )
}

export function Import({
  source: initial,
  demo,
}: {
  source?: ImportSource | undefined
  demo: boolean
}) {
  const client = useClient()
  const [source, setSource] = useState<ImportSource>(initial ?? 'streamelements')
  const [token, setToken] = useState('')
  const [platform, setPlatform] = useState<ChatPlatform>('twitch')
  const [pointsFile, setPointsFile] = useState<File | null>(null)
  const [tipsFile, setTipsFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [choice, setChoice] = useState<ConflictChoice>('keep')
  const [report, setReport] = useState<ImportReport | null>(null)
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null)
  const [error, setError] = useState<Failure | null>(null)
  const [status, setStatus] = useState('')
  const previewHeading = useRef<HTMLHeadingElement>(null)
  const reportHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (initial) setSource(initial)
  }, [initial])
  useEffect(() => {
    if (preview) previewHeading.current?.focus()
  }, [preview])
  useEffect(() => {
    if (report) reportHeading.current?.focus()
  }, [report])

  // a preview belongs to the exact inputs it was made from: any change makes it stale
  const pickPoints = (f: File | null) => {
    setPointsFile(f)
    setPreview(null)
  }
  const pickTips = (f: File | null) => {
    setTipsFile(f)
    setPreview(null)
  }
  const pickPlatform = (p: ChatPlatform) => {
    setPlatform(p)
    setPreview(null)
  }
  const pickSource = (s: ImportSource) => {
    setSource(s)
    setPreview(null)
    setError(null)
    go({ name: 'import', source: s })
  }

  const filesOk =
    (pointsFile !== null || tipsFile !== null) &&
    [pointsFile, tipsFile].every((f) => f === null || f.size <= MAX_FILE)
  const canPreview = source === 'streamelements' ? token.trim() !== '' : filesOk

  const runPreview = async () => {
    setBusy('preview')
    setError(null)
    setPreview(null)
    setStatus(
      source === 'streamelements'
        ? 'Reading your StreamElements channel…'
        : 'Reading your Streamlabs files…',
    )
    try {
      const p =
        source === 'streamelements'
          ? await client.previewStreamElements(token)
          : await client.previewStreamlabs({
              ...(pointsFile
                ? { platform, points: { file: pointsFile, name: pointsFile.name } }
                : {}),
              ...(tipsFile ? { tips: { file: tipsFile, name: tipsFile.name } } : {}),
            })
      // The token has done its job; don't keep it on screen.
      setToken('')
      setChoice('keep')
      setPreview(p)
      const found = p.sections.reduce((a, s) => a + s.found, 0)
      setStatus(`Preview ready: ${n(found)} items found. Nothing has changed yet.`)
    } catch (e) {
      const d = describeError(e)
      setError(d)
      setStatus(`Preview failed. ${d.message}`)
    } finally {
      setBusy(null)
    }
  }

  const runApply = async () => {
    if (!preview) return
    setBusy('apply')
    setError(null)
    setStatus('Importing…')
    try {
      const r = await client.applyImport(preview.preview_id, choice)
      setReport(r)
      setPreview(null)
      setPointsFile(null)
      setTipsFile(null)
      const added = r.sections.reduce((a, s) => a + s.added + s.replaced, 0)
      setStatus(`Import finished: ${n(added)} items came over.`)
    } catch (e) {
      const d = describeError(e)
      setError(d)
      setStatus(`Import failed. ${d.message}`)
    } finally {
      setBusy(null)
    }
  }

  const reset = () => {
    setReport(null)
    setPreview(null)
    setError(null)
    setStatus('')
  }

  const conflicts = preview?.sections.reduce((a, s) => a + s.conflicts, 0) ?? 0
  const nothingNew =
    preview !== null &&
    preview.sections.every((s) => s.new + s.conflicts + s.waiting + s.needs_match === 0)

  return (
    <div className="mx-auto max-w-3xl">
      <a
        href={href({ name: 'settings', section: 'data' })}
        className="mb-3 inline-flex items-center gap-1.5 rounded-control text-[13.5px] font-medium text-text-3 hover:text-text focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
      >
        <ArrowLeft size={14} aria-hidden="true" /> Your data
      </a>
      <PageHeader
        title="Bring your setup"
        description="Move over from StreamElements or Streamlabs. You review it first."
      />
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {status}
      </p>

      {report ? (
        <Report report={report} headingRef={reportHeading} onAgain={reset} />
      ) : (
        <div className="flex flex-col gap-5">
          <Panel title="Where from" id="import-source">
            <div className="flex flex-col gap-4">
              <Segmented<ImportSource>
                label="Import from"
                value={source}
                onChange={pickSource}
                options={[
                  { value: 'streamelements', label: 'StreamElements' },
                  { value: 'streamlabs', label: 'Streamlabs' },
                ]}
                className="self-start"
              />
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (canPreview && busy === null) void runPreview()
                }}
              >
                {source === 'streamelements' ? (
                  <>
                    <Field
                      label="StreamElements JWT token"
                      hint={
                        <>
                          streamelements.com: Account → Channels → Show secrets → JWT Token. Used
                          once, never saved, read-only.
                        </>
                      }
                    >
                      {(p) => (
                        <Input
                          {...p}
                          type="password"
                          value={token}
                          spellCheck={false}
                          autoCapitalize="off"
                          autoComplete="off"
                          placeholder="eyJhbGciOi…"
                          onChange={(e) => setToken(e.target.value)}
                        />
                      )}
                    </Field>
                    {demo && (
                      <button
                        type="button"
                        className="self-start rounded-control text-[13.5px] font-semibold text-accent-text underline underline-offset-2 hover:no-underline focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none"
                        onClick={() => setToken(DEMO_SE_TOKEN)}
                      >
                        Use the demo’s sample token
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[13.5px] leading-relaxed text-text-2">
                      Streamlabs works from files you export. Its commands and timers can’t be
                      exported, so they can’t come over.
                    </p>
                    <FilePick
                      label="Points export"
                      hint="Chatbot → Currency → Export. CSV or .xlsx with Name and Points (plus a User ID if you have it), up to 10 MB."
                      file={pointsFile}
                      onPick={pickPoints}
                      optional={tipsFile !== null}
                    />
                    {pointsFile && (
                      <Field
                        label="These viewers watch you on"
                        hint={
                          platform === 'youtube'
                            ? 'YouTube names aren’t unique. Without a Channel ID column, points wait for a match.'
                            : 'Matched by login or user id, never by display name.'
                        }
                      >
                        {(p) => (
                          <Select
                            {...p}
                            className="sm:max-w-[16rem]"
                            value={platform}
                            onChange={(e) => pickPlatform(e.target.value as ChatPlatform)}
                          >
                            {(['twitch', 'youtube', 'kick'] as const).map((pl) => (
                              <option key={pl} value={pl}>
                                {PLATFORM_LABEL[pl]}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                    )}
                    <FilePick
                      label="Tip history"
                      hint="A donations export with Date, Name, Amount and Currency (Message optional)."
                      file={tipsFile}
                      onPick={pickTips}
                      optional
                    />
                  </>
                )}
                {error && !preview && <ErrorNote error={error} />}
                <div>
                  <Button
                    type="submit"
                    variant="primary"
                    busy={busy === 'preview'}
                    disabled={!canPreview}
                  >
                    Preview
                  </Button>
                </div>
              </form>
            </div>
          </Panel>

          {preview && (
            <section
              aria-labelledby="import-preview-title"
              className="flex min-w-0 flex-col rounded-panel border border-line bg-surface-1 px-4 py-4 shadow-1 sm:px-5"
            >
              <h2
                id="import-preview-title"
                ref={previewHeading}
                tabIndex={-1}
                className="font-display text-[15px] font-semibold tracking-tight text-text focus:outline-none"
              >
                What will come over
              </h2>
              <p className="mt-0.5 text-[13.5px] text-text-3">
                {preview.account
                  ? `From ${preview.account.name} on ${SOURCE_LABEL[preview.source]}${
                      preview.account.platform
                        ? ` (${PLATFORM_LABEL[preview.account.platform]})`
                        : ''
                    }. `
                  : `From your ${SOURCE_LABEL[preview.source]} files. `}
                Nothing has changed yet.
              </p>
              <ul className="mt-4 flex flex-col divide-y divide-line">
                {preview.sections.map((s) => (
                  <li key={s.kind} className="py-3 first:pt-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                      <h3 className="text-sm font-semibold text-text">{KIND_LABEL[s.kind]}</h3>
                      {s.found === 0 && (
                        <span className="text-[13.5px] text-text-3">
                          None found on {SOURCE_LABEL[preview.source]}
                        </span>
                      )}
                    </div>
                    {s.found > 0 && (
                      <div
                        className={cx(
                          'mt-2 grid grid-cols-2 gap-3',
                          s.needs_match > 0 ? 'sm:grid-cols-5' : 'sm:grid-cols-4',
                        )}
                      >
                        <Count value={s.new} label="New" />
                        <Count value={s.conflicts} label="Already here" tone="warn" />
                        {s.kind === 'points' ? (
                          <Count value={s.waiting} label="Paid when they show up" />
                        ) : (
                          <Count value={s.found} label="Found" />
                        )}
                        {s.needs_match > 0 && (
                          <Count value={s.needs_match} label="Need a match" tone="warn" />
                        )}
                        <Count value={s.skipped} label="Skipped" />
                      </div>
                    )}
                    <Items
                      title="Already in Ferrocast"
                      items={s.conflict_items}
                      total={s.conflicts}
                    />
                    <Items
                      title="Need a match, not paid automatically"
                      items={s.needs_match_items}
                      total={s.needs_match}
                    />
                    <Items title="Skipped, and why" items={s.skipped_items} total={s.skipped} />
                    <Notes notes={s.notes} />
                  </li>
                ))}
              </ul>
              <NotImportedList items={preview.not_imported} />

              <div className="mt-5 flex flex-col gap-4 border-t border-line pt-4">
                {conflicts > 0 && (
                  <div className="flex flex-col gap-2">
                    <span id="conflict-label" className="text-[13.5px] font-medium text-text-2">
                      {n(conflicts)} {conflicts === 1 ? 'thing is' : 'things are'} already in
                      Ferrocast. Keep or replace them?
                    </span>
                    <Segmented<ConflictChoice>
                      label="When something is already in Ferrocast"
                      value={choice}
                      onChange={setChoice}
                      options={[
                        { value: 'keep', label: 'Keep mine' },
                        { value: 'replace', label: 'Use imported' },
                      ]}
                      className="self-start"
                    />
                    <p className="text-[13.5px] text-text-3">
                      {choice === 'keep'
                        ? 'Your Ferrocast versions stay as they are.'
                        : 'The imported versions replace yours. Nothing is deleted.'}
                    </p>
                  </div>
                )}
                {error && <ErrorNote error={error} />}
                <p className="text-[13.5px] text-text-3">
                  A backup is taken first. Undo it in Settings → Your data.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    busy={busy === 'apply'}
                    disabled={nothingNew}
                    onClick={() => void runApply()}
                  >
                    Import
                  </Button>
                  <Button variant="ghost" onClick={reset}>
                    Cancel
                  </Button>
                </div>
                {nothingNew && (
                  <p className="text-[13.5px] text-text-2">
                    There’s nothing new to bring over from this {SOURCE_LABEL[preview.source]}{' '}
                    {preview.source === 'streamelements' ? 'account' : 'export'}.
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function Report({
  report,
  headingRef,
  onAgain,
}: {
  report: ImportReport
  headingRef: RefObject<HTMLHeadingElement | null>
  onAgain: () => void
}) {
  const line = (s: ImportReport['sections'][number]) => {
    const parts: string[] = []
    if (s.added) parts.push(`${n(s.added)} added`)
    if (s.replaced) parts.push(`${n(s.replaced)} replaced`)
    if (s.kept) parts.push(`${n(s.kept)} kept as they were`)
    if (s.waiting) parts.push(`${n(s.waiting)} waiting for their first visit`)
    if (s.needs_match) parts.push(`${n(s.needs_match)} need a match`)
    if (s.skipped) parts.push(`${n(s.skipped)} skipped`)
    return parts.length ? parts.join(', ') : 'Nothing to bring over'
  }
  return (
    <section
      aria-labelledby="import-report-title"
      className="flex min-w-0 flex-col rounded-panel border border-line bg-surface-1 px-4 py-4 shadow-1 sm:px-5"
    >
      <div className="flex items-center gap-2">
        <CheckCircle size={20} weight="fill" className="text-ok" aria-hidden="true" />
        <h2
          id="import-report-title"
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-[15px] font-semibold tracking-tight text-text focus:outline-none"
        >
          Import finished
        </h2>
        <Badge>{SOURCE_LABEL[report.source]}</Badge>
      </div>
      <p className="mt-1 text-[13.5px] text-text-3">
        A backup was taken first. Undo it in Settings → Your data.
      </p>
      <ul className="mt-4 flex flex-col divide-y divide-line">
        {report.sections.map((s) => (
          <li key={s.kind} className="py-3 first:pt-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-sm font-semibold text-text">{KIND_LABEL[s.kind]}</h3>
              <span className="text-[13.5px] text-text-2">{line(s)}</span>
            </div>
            <Items
              title="Need a match, not paid automatically"
              items={s.needs_match_items}
              total={s.needs_match}
            />
            <Items title="Skipped, and why" items={s.skipped_items} total={s.skipped} />
            <Notes notes={s.notes} />
          </li>
        ))}
      </ul>
      <NotImportedList items={report.not_imported} />
      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="primary" onClick={() => go({ name: 'bot' })}>
          Open Bot
        </Button>
        <Button onClick={() => go({ name: 'community' })}>Open Community</Button>
        <Button variant="ghost" onClick={onAgain}>
          Import more
        </Button>
      </div>
    </section>
  )
}

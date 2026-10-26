// Go live in Advanced mode (A2.5; owner's picks 2B and 3, 24 Oct board): one "Advanced
// settings" card with a tab per platform and one for the local server, and upload protection's
// rule as a sentence with its numbers. API.md §4 "Go live everywhere", PUT /golive/advanced.

import { useState, type ReactNode } from 'react'
import { ArrowsClockwise } from '@phosphor-icons/react'
import {
  DEST_ADVANCED_DEFAULT,
  checkAdvanced,
  onCanvas,
  type Advanced,
  type DestAdvanced,
  type GoLiveView,
} from '@ferrocast/api'
import { Button, Dialog, Field, Input, Select, cx } from '@ferrocast/ui'
import { Panel } from '../Panel'
import { useAction } from '../../lib/hooks'
import { useGoLive } from './golive'

/** A draft of the Advanced settings that follows the saved ones until edited. */
function useDraft(view: GoLiveView) {
  const saved = JSON.stringify(view.advanced)
  const [draft, setDraft] = useState<Advanced>(view.advanced)
  const [seen, setSeen] = useState(saved)
  if (seen !== saved) {
    setSeen(saved)
    setDraft(view.advanced)
  }
  return { draft, setDraft, dirty: JSON.stringify(draft) !== saved }
}

/** A number box with its unit; empty or nonsense stays as typed until it's checked. */
function NumberIn({
  value,
  onChange,
  unit,
  label,
  className,
}: {
  value: number
  onChange: (n: number) => void
  unit: string
  label: string
  className?: string
}) {
  // The shared Input fills its holder: the holder sets the width, so it sits in a sentence.
  return (
    <span className={cx('inline-flex items-center gap-1.5 align-middle', className)}>
      <span className="inline-block w-[72px]">
        <Input
          aria-label={label}
          inputMode="numeric"
          className="h-8 text-right tabular-nums"
          value={Number.isFinite(value) ? String(value) : ''}
          onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
        />
      </span>
      {unit && <span className="text-[14px] text-text-3">{unit}</span>}
    </span>
  )
}

function Problem({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <p role="alert" className="m-0 text-[14px] font-semibold text-danger">
      {text.replace(/^[\w.]+:\s*/, '')}
    </p>
  )
}

/** Upload protection's rule in Advanced mode (board item 3). */
export function ProtectionRule({ view, onSaved }: { view: GoLiveView; onSaved: () => void }) {
  const api = useGoLive()
  const { run, busy } = useAction()
  const { draft, setDraft, dirty } = useDraft(view)
  const r = draft.rules
  const set = (patch: Partial<Advanced['rules']>) =>
    setDraft({ ...draft, rules: { ...r, ...patch } })
  const main = onCanvas(view.destinations, 'main')
  const problem = checkAdvanced(
    draft,
    view.destinations.map((d) => d.id),
  )
  const save = () =>
    void run('rule', () => api.setAdvanced(draft), {
      success: 'Upload protection’s rule saved.',
    }).then((x) => x && onSaved())
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-surface-2 p-3">
      <p className="m-0 text-[14.5px] leading-[2.4] text-text-2">
        Pause a platform when one gets under{' '}
        <NumberIn
          label="Slow share"
          unit="%"
          value={r.slow_pct}
          onChange={(n) => set({ slow_pct: n })}
        />{' '}
        of the stream, or skips video, for{' '}
        <NumberIn
          label="Trouble seconds"
          unit="s"
          value={r.trouble_s}
          onChange={(n) => set({ trouble_s: n })}
        />
        . Pause{' '}
        <span className="inline-block w-44 align-middle">
          <Select
            aria-label="Which pauses first"
            className="h-8"
            value={r.first_to_pause ?? ''}
            onChange={(e) => set({ first_to_pause: e.target.value || null })}
          >
            <option value="">the bottom one</option>
            {main.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </span>{' '}
        first. Bring it back after{' '}
        <NumberIn
          label="Calm seconds"
          unit="s"
          value={r.calm_s}
          onChange={(n) => set({ calm_s: n })}
        />{' '}
        of calm, no sooner than{' '}
        <NumberIn
          label="First pause"
          unit="s"
          value={r.first_pause_s}
          onChange={(n) => set({ first_pause_s: n })}
        />
        , doubling each time up to{' '}
        <NumberIn
          label="Longest pause"
          unit="s"
          value={r.max_pause_s}
          onChange={(n) => set({ max_pause_s: n })}
        />
        .
      </p>
      <p className="m-0 text-[13.5px] text-text-3">Never pauses the last platform live.</p>
      <Problem text={dirty ? problem : null} />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          busy={busy === 'rule'}
          disabled={!dirty || !!problem}
          onClick={save}
        >
          Save rule
        </Button>
        {dirty && (
          <Button size="sm" variant="ghost" onClick={() => setDraft(view.advanced)}>
            Undo changes
          </Button>
        )}
      </div>
    </div>
  )
}

const LOCAL = 'local'

/** "Advanced settings" (board item 2B): a tab per platform and one for the local server. */
export function AdvancedCard({ view, onSaved }: { view: GoLiveView; onSaved: () => void }) {
  const api = useGoLive()
  const { run, busy } = useAction()
  const { draft, setDraft, dirty } = useDraft(view)
  const main = onCanvas(view.destinations, 'main')
  const [picked, setTab] = useState<string>(main[0]?.id ?? LOCAL)
  // A removed server's tab falls back to the first one (its settings went with it).
  const tab =
    picked === LOCAL || main.some((d) => d.id === picked) ? picked : (main[0]?.id ?? LOCAL)
  const [asking, setAsking] = useState(false)
  const problem = checkAdvanced(
    draft,
    view.destinations.map((d) => d.id),
  )
  const dest = main.find((d) => d.id === tab)
  const per: DestAdvanced = draft.per[tab] ?? DEST_ADVANCED_DEFAULT
  const setPer = (patch: Partial<DestAdvanced>) =>
    setDraft({ ...draft, per: { ...draft.per, [tab]: { ...per, ...patch } } })
  const save = () =>
    void run('adv', () => api.setAdvanced(draft), { success: 'Advanced settings saved.' }).then(
      (x) => x && onSaved(),
    )
  const newKey = () =>
    void run('key', () => api.newKey().then(() => true), {
      success: 'New key made. OBS was pointed at it again.',
    }).then((x) => {
      setAsking(false)
      if (x) onSaved()
    })
  const tabs = [
    ...main.map((d) => ({ id: d.id, label: d.name })),
    { id: LOCAL, label: 'Local server' },
  ]
  return (
    <Panel
      id="golive-advanced"
      title="Advanced settings"
      description="Defaults work for most people. Changes apply from the next time each platform connects."
    >
      <div className="flex flex-col gap-4">
        <div
          role="tablist"
          aria-label="Which settings"
          className="-mx-1 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-1 [scrollbar-width:none]"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tab}
              onClick={() => setTab(t.id)}
              className={cx(
                '-mb-px h-10 shrink-0 border-b-2 px-2.5 text-[14.5px] font-semibold whitespace-nowrap focus-visible:shadow-[var(--fc-focus)] focus-visible:outline-none',
                t.id === tab
                  ? 'border-accent text-text'
                  : 'border-transparent text-text-3 hover:text-text-2',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" className="flex flex-col gap-4">
          {tab === LOCAL ? (
            <>
              <Row
                label="Port"
                hint="Used from the next time Ferrocast starts. Changing it points OBS again then."
              >
                <NumberIn
                  label="Port"
                  unit=""
                  value={draft.port}
                  onChange={(n) => setDraft({ ...draft, port: n })}
                />
              </Row>
              <Row
                label="Stream key"
                hint="OBS and Aitum Vertical are pointed at a new key by themselves."
              >
                <Button
                  size="sm"
                  icon={<ArrowsClockwise size={15} />}
                  onClick={() => setAsking(true)}
                >
                  Make a new key
                </Button>
              </Row>
              <Row
                label="Keep this much upload free"
                hint="For the game and chat, in the upload check."
              >
                <NumberIn
                  label="Upload kept free"
                  unit="%"
                  value={draft.keep_free_pct}
                  onChange={(n) => setDraft({ ...draft, keep_free_pct: n })}
                />
              </Row>
            </>
          ) : (
            <>
              {dest?.kind !== 'custom' && (
                <Field
                  label="Server"
                  optional
                  hint={`Empty: the one ${dest?.name ?? 'the platform'} gives (the nearest). Another region, or rtmp:// instead of rtmps://.`}
                >
                  {(p) => (
                    <Input
                      {...p}
                      placeholder={`Nearest, from ${dest?.name ?? 'the platform'}`}
                      value={per.server ?? ''}
                      onChange={(e) =>
                        setPer({ server: e.target.value.trim() ? e.target.value.trim() : null })
                      }
                    />
                  )}
                </Field>
              )}
              <Row
                label="First retry after"
                hint="If it drops, the first wait before trying again."
              >
                <NumberIn
                  label="First retry"
                  unit="s"
                  value={per.first_retry_s}
                  onChange={(n) => setPer({ first_retry_s: n })}
                />
              </Row>
              <Row label="Longest wait between tries" hint="Each wait doubles up to this.">
                <NumberIn
                  label="Longest wait"
                  unit="s"
                  value={per.max_retry_s}
                  onChange={(n) => setPer({ max_retry_s: n })}
                />
              </Row>
            </>
          )}
        </div>
        <Problem text={dirty ? problem : null} />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            busy={busy === 'adv'}
            disabled={!dirty || !!problem}
            onClick={save}
          >
            Save
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={() => setDraft(view.advanced)}>
              Undo changes
            </Button>
          )}
        </div>
      </div>
      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        title="Make a new stream key?"
        description="The old key stops working at once. OBS and Aitum Vertical are pointed at the new one if they streamed here; set anything else up again by hand."
        size="sm"
        footer={
          <>
            <Button onClick={() => setAsking(false)}>Keep this key</Button>
            <Button variant="danger" busy={busy === 'key'} onClick={newKey}>
              Make a new key
            </Button>
          </>
        }
      />
    </Panel>
  )
}

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="m-0 text-[14.5px] font-semibold text-text">{label}</p>
        <p className="m-0 text-[13.5px] text-text-3">{hint}</p>
      </div>
      <div>{children}</div>
    </div>
  )
}

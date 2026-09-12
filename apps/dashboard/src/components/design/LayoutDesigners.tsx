// Designers for theme, scene and widget designs. A theme's scenes are edited with the same
// layout editor as overlays (layers, align, snapping, undo); a widget design is a style.

import { useState } from 'react'
import {
  DEFAULT_THEME,
  SCENE_LABEL,
  type Design,
  type Media,
  type Scene,
  type ThemeDesign,
  type SceneDesign,
  type WidgetDesign,
  type WidgetStyle,
} from '@ferrocast/api'
import { Button, Dialog, Field, Select, Switch, cx } from '@ferrocast/ui'
import { LayoutEditor } from '../layout/LayoutEditor'
import { useHistory, useUndoKeys } from '../../lib/history'
import { useResource } from '../../lib/hooks'
import { go } from '../../lib/router'
import { useLeaveGuard } from '../../lib/unsaved'
import { DesignerHeader, DuplicateDialog, useDesignSave } from '../../screens/Designer'
import { ColorField, Range } from './inspector'
import { UseDialog } from './dialogs'
import { useSampleState, WidgetPreview } from './previews'

function LeaveDialog({
  open,
  builtIn,
  saving,
  onStay,
  onDiscard,
  onSave,
}: {
  open: boolean
  builtIn: boolean
  saving: boolean
  onStay: () => void
  onDiscard: () => void
  onSave: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onStay}
      size="sm"
      title="Save your design first?"
      description={
        builtIn
          ? 'Your changes to this built-in only stay if you save them as your own copy.'
          : 'You changed this design. Save it to keep the changes.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onStay}>
            Stay
          </Button>
          <Button variant="secondary" onClick={onDiscard}>
            Discard
          </Button>
          <Button variant="primary" busy={saving} onClick={onSave}>
            {builtIn ? 'Save my copy' : 'Save and leave'}
          </Button>
        </>
      }
    />
  )
}

export function SceneDesigner({
  design,
  onSaved,
}: {
  design: ThemeDesign | SceneDesign
  onSaved: (d: Design) => void
}) {
  const h = useHistory<ThemeDesign | SceneDesign>(design)
  useUndoKeys(h)
  const draft = h.value
  const scenes: Scene[] = draft.kind === 'theme' ? draft.content.scenes : [draft.content]
  const [key, setKey] = useState(scenes[0]?.key ?? 'in_game')
  const scene = scenes.find((s) => s.key === key) ?? scenes[0]
  const themes = useResource((c) => c.themes())
  const goals = useResource((c) => c.goals())
  const media = useResource((c) => c.media())
  const alerts = useResource((c) => c.designs('alert'))
  const state = useSampleState(scene?.layers ?? [])
  const [preview, setPreview] = useState(true)
  const [using, setUsing] = useState(false)
  const [askDuplicate, setAskDuplicate] = useState(false)
  const { save, busy } = useDesignSave(design, (d) => {
    onSaved(d)
    if (d.kind === 'theme' || d.kind === 'scene') h.reset(d)
  })
  const dirty = JSON.stringify(draft) !== JSON.stringify(design)
  const leaving = useLeaveGuard(dirty)
  if (!scene) return null
  const setScene = (next: Scene, opts?: { merge?: boolean }) =>
    h.set(
      (d) =>
        (d.kind === 'theme'
          ? {
              ...d,
              content: {
                ...d.content,
                scenes: d.content.scenes.map((s) => (s.key === next.key ? next : s)),
              },
            }
          : { ...d, content: next }) as ThemeDesign | SceneDesign,
      opts,
    )
  return (
    <div className="flex flex-col gap-4">
      <DesignerHeader
        design={design}
        name={draft.name}
        onName={(name) => h.set((d) => ({ ...d, name }))}
        history={h}
        dirty={dirty}
        saving={busy === 'save'}
        onSave={() => void save(draft)}
        onUse={() => setUsing(true)}
        onDuplicate={() => setAskDuplicate(true)}
      />
      {draft.kind === 'theme' && (
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Scenes"
            className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none]"
          >
            {scenes.map((s) => (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={s.key === key}
                onClick={() => setKey(s.key)}
                className={cx(
                  'fc-press inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-medium',
                  s.key === key
                    ? 'border-accent-line bg-accent-soft text-text'
                    : 'border-line text-text-2 hover:border-line-strong',
                )}
              >
                {s.name || SCENE_LABEL[s.key] || s.key}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={preview}
            onClick={() => setPreview((p) => !p)}
          >
            {preview ? 'Hide live view' : 'Live view'}
          </Button>
        </div>
      )}
      {design.built_in && (
        <p className="text-[13px] text-text-3">
          Built-in theme: it keeps a small Ferrocast mark on stream. Your edits stay a draft until
          you save your own copy, which has no branding.
        </p>
      )}
      <LayoutEditor
        layout={{
          name: scene.name,
          width: scene.width,
          height: scene.height,
          widgets: scene.layers,
        }}
        onWidgets={(layers, opts) => setScene({ ...scene, layers }, opts)}
        brandLocked={design.built_in}
        state={state}
        themes={themes.data ?? [{ id: DEFAULT_THEME, name: 'Molten', description: '', pro: false }]}
        goals={goals.data ?? []}
        onGoalCreated={(g) => goals.set((p) => [...(p ?? []), g])}
        preview={preview}
        media={media.data ?? []}
        onUploaded={(m: Media) => media.set((p) => [...(p ?? []), m])}
      />
      {draft.kind === 'theme' && !design.built_in && (
        <Field
          label="Alert style that goes with this theme"
          hint="Used when you press Use and keep “Also use its alert style” on."
        >
          {(p) => (
            <Select
              {...p}
              value={draft.content.alert_design ?? ''}
              onChange={(e) =>
                h.set((d) =>
                  d.kind === 'theme'
                    ? { ...d, content: { ...d.content, alert_design: e.target.value || null } }
                    : d,
                )
              }
              className="max-w-sm"
            >
              <option value="">None</option>
              {(alerts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      {using && <UseDialog design={draft} onClose={() => setUsing(false)} />}
      <DuplicateDialog
        open={askDuplicate}
        design={design}
        onClose={() => setAskDuplicate(false)}
        onDone={(d) => (setAskDuplicate(false), go({ name: 'designer', id: d.id }))}
      />
      <LeaveDialog
        open={leaving.pending !== null}
        builtIn={design.built_in}
        saving={busy === 'save'}
        onStay={leaving.stay}
        onDiscard={() => (h.reset(design), leaving.leave())}
        onSave={() => void save(draft).then((d) => d && leaving.leave())}
      />
    </div>
  )
}

const VARIANTS: Record<string, { value: string; label: string }[]> = {
  goal: [
    { value: 'bar', label: 'Slim bar' },
    { value: 'segments', label: 'Segments' },
  ],
  label: [
    { value: 'tag', label: 'Tag' },
    { value: 'ticker', label: 'Slanted ticker' },
  ],
  events: [{ value: 'cards', label: 'Cards' }],
  chat: [
    { value: 'plates', label: 'Plates' },
    { value: 'lines', label: 'Lines' },
  ],
}

export function WidgetDesigner({
  design,
  onSaved,
}: {
  design: WidgetDesign
  onSaved: (d: Design) => void
}) {
  const h = useHistory<WidgetDesign>(design)
  useUndoKeys(h)
  const draft = h.value
  const style = draft.content.style
  const set = (p: Partial<WidgetStyle>, merge = false) =>
    h.set((d) => ({ ...d, content: { ...d.content, style: { ...d.content.style, ...p } } }), {
      merge,
    })
  const [using, setUsing] = useState(false)
  const [askDuplicate, setAskDuplicate] = useState(false)
  const { save, busy } = useDesignSave(design, (d) => {
    onSaved(d)
    if (d.kind === 'widget') h.reset(d)
  })
  const dirty = JSON.stringify(draft) !== JSON.stringify(design)
  const leaving = useLeaveGuard(dirty)
  const variants = VARIANTS[draft.content.widget] ?? []
  return (
    <div className="flex flex-col gap-4">
      <DesignerHeader
        design={design}
        name={draft.name}
        onName={(name) => h.set((d) => ({ ...d, name }))}
        history={h}
        dirty={dirty}
        saving={busy === 'save'}
        onSave={() => void save(draft)}
        onUse={() => setUsing(true)}
        onDuplicate={() => setAskDuplicate(true)}
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <WidgetPreview
          design={draft}
          className="relative aspect-video w-full overflow-hidden rounded-panel border border-line"
        />
        <section
          aria-label="Style"
          className="flex flex-col gap-4 rounded-panel border border-line bg-surface-1 p-4"
        >
          {variants.length > 0 && (
            <Field label="Look">
              {(p) => (
                <Select
                  {...p}
                  value={style.variant ?? variants[0]?.value ?? ''}
                  onChange={(e) => set({ variant: e.target.value })}
                >
                  {variants.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <ColorField
              label="Text"
              value={style.text ?? '#eef0f4'}
              onChange={(v) => set({ text: v }, true)}
            />
            <ColorField
              label="Accent"
              value={style.accent ?? '#ffa424'}
              onChange={(v) => set({ accent: v }, true)}
            />
            <ColorField
              label="Background"
              value={style.background ?? '#101216'}
              onChange={(v) => set({ background: v }, true)}
            />
            {draft.content.widget === 'goal' && (
              <ColorField
                label="Track"
                value={style.track ?? '#16191e'}
                onChange={(v) => set({ track: v }, true)}
              />
            )}
          </div>
          <Field label="Font">
            {(p) => (
              <Select
                {...p}
                value={style.font ?? 'Bricolage Grotesque'}
                onChange={(e) => set({ font: e.target.value })}
              >
                {['Bricolage Grotesque', 'Hanken Grotesk', 'JetBrains Mono'].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </Select>
            )}
          </Field>
          <Range
            label="Corner radius"
            value={style.radius ?? 12}
            min={0}
            max={32}
            unit="px"
            onChange={(v, m) => set({ radius: v }, m)}
          />
          <Switch
            checked={style.uppercase ?? false}
            onChange={(uppercase) => set({ uppercase })}
            label="All caps"
          />
          {design.built_in && (
            <p className="text-[12.5px] text-text-3">
              Built-in: it keeps a small Ferrocast mark on stream. Save your own copy to drop it.
            </p>
          )}
        </section>
      </div>
      {using && <UseDialog design={draft} onClose={() => setUsing(false)} />}
      <DuplicateDialog
        open={askDuplicate}
        design={design}
        onClose={() => setAskDuplicate(false)}
        onDone={(d) => (setAskDuplicate(false), go({ name: 'designer', id: d.id }))}
      />
      <LeaveDialog
        open={leaving.pending !== null}
        builtIn={design.built_in}
        saving={busy === 'save'}
        onStay={leaving.stay}
        onDiscard={() => (h.reset(design), leaving.leave())}
        onSave={() => void save(draft).then((d) => d && leaving.leave())}
      />
    </div>
  )
}

import { useState } from 'react'
import {
  ArrowsClockwise,
  DotsThree,
  Layout,
  PencilSimple,
  Plus,
  Trash,
} from '@phosphor-icons/react'
import { describeError, type Overlay, type OverlayPreset } from '@ferrocast/api'
import { Button, Dialog, EmptyState, Field, IconButton, Input, Skeleton, cx } from '@ferrocast/ui'
import { LoadError, PageHeader } from '../components/Panel'
import { Menu } from '../components/Menu'
import { ObsIcon, SecretUrl, useAddToObs } from '../components/obs'
import { done, useAction, useClient, useResource } from '../lib/hooks'
import { go, href } from '../lib/router'
import { useUsesObs } from '../lib/picture'
import { AddToStudioDialog } from '../components/studio/desk/add-to-studio'
import { SavedOverlayPreview } from '../components/design/previews'

const WIDGET_NAME: Record<string, string> = {
  alerts: 'Alerts',
  chat: 'Chat',
  events: 'Event list',
  goal: 'Goal',
  label: 'Label',
  viewers: 'Viewers',
  poll: 'Poll',
  giveaway: 'Giveaway',
  // Designs' pictures and shapes: counted, not listed one by one.
  layer: '',
}

const PRESETS: { value: OverlayPreset; title: string; body: string }[] = [
  {
    value: 'starter',
    title: 'Everything',
    body: 'Alerts, chat, a goal, latest follower, viewers and recent events.',
  },
  {
    value: 'alerts_only',
    title: 'Just alerts',
    body: 'One alert box in the middle. The usual first overlay.',
  },
  {
    value: 'chat_only',
    title: 'Just chat',
    body: 'Merged chat from every platform, down the side.',
  },
  { value: 'blank', title: 'Blank', body: 'Start empty and add widgets yourself.' },
]

/** The overlay as it looks, with sample alerts, chat and goals. */
function LayoutThumb({ overlay }: { overlay: Overlay }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-line" aria-hidden="true">
      <SavedOverlayPreview overlay={overlay} />
    </div>
  )
}

export function Overlays() {
  const client = useClient()
  const overlays = useResource((c) => c.overlays())
  const { run, busy } = useAction()
  const { add, busy: adding, guide } = useAddToObs()
  // With Ferrocast's Studio an overlay goes into one of its scenes; OBS stays in the menu.
  const usesObs = useUsesObs()
  const [toStudio, setToStudio] = useState<Overlay | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [preset, setPreset] = useState<OverlayPreset>('alerts_only')
  const [nameError, setNameError] = useState<string | null>(null)
  const [regen, setRegen] = useState<Overlay | null>(null)
  const [removing, setRemoving] = useState<Overlay | null>(null)
  const [renaming, setRenaming] = useState<{ o: Overlay; name: string } | null>(null)

  const create = async () => {
    const n = name.trim()
    if (!n) {
      setNameError('Give it a name, like “Starting soon”.')
      return
    }
    try {
      const o = await client.createOverlay(n, preset)
      overlays.set((p) => [...(p ?? []), o])
      setCreating(false)
      setName('')
      go({ name: 'overlay', id: o.id })
    } catch (e) {
      setNameError(describeError(e).message.replace(/^\w+: /, ''))
    }
  }

  return (
    <div>
      <PageHeader
        title="Overlays"
        description={
          usesObs
            ? 'Each overlay is one OBS Browser source. Group widgets to keep OBS light.'
            : 'Each overlay is one Browser source in your scenes. Group widgets to keep it light.'
        }
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} weight="bold" />}
            onClick={() => setCreating(true)}
          >
            New overlay
          </Button>
        }
      />
      {overlays.error ? (
        <LoadError error={overlays.error} onRetry={overlays.reload} />
      ) : !overlays.data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : overlays.data.length === 0 ? (
        <EmptyState
          title="No overlays yet"
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              Create your first overlay
            </Button>
          }
        >
          An overlay holds your alerts, chat and goals. Add it to {usesObs ? 'OBS' : 'the Studio'}{' '}
          once and change it any time from here.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {overlays.data.map((o) => (
            <li
              key={o.id}
              className="flex min-w-0 flex-col gap-3 rounded-panel border border-line bg-surface-1 p-4 shadow-1"
            >
              <a
                href={href({ name: 'overlay', id: o.id })}
                className="group block focus-visible:outline-none"
                aria-label={`Edit ${o.name}`}
              >
                <div className="transition-transform duration-200 group-hover:scale-[1.01] group-focus-visible:shadow-[var(--fc-focus)]">
                  <LayoutThumb overlay={o} />
                </div>
              </a>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-[18px] font-extrabold tracking-tight">
                    {o.name}
                  </h2>
                  <p className="mt-0.5 truncate text-[14.5px] text-text-2">
                    {o.widgets.length
                      ? [
                          ...new Set(o.widgets.map((w) => WIDGET_NAME[w.kind]).filter(Boolean)),
                        ].join(', ') || `${o.widgets.length} widgets`
                      : 'No widgets yet'}
                  </p>
                </div>
                <Menu
                  label={`${o.name} options`}
                  align="end"
                  trigger={(p) => (
                    <IconButton {...p} size="sm" label={`More for ${o.name}`}>
                      <DotsThree size={18} weight="bold" />
                    </IconButton>
                  )}
                  items={[
                    ...(usesObs
                      ? []
                      : [
                          {
                            key: 'obs',
                            label: 'Add to OBS',
                            icon: <ObsIcon size={15} />,
                            onSelect: () => void add(o),
                          },
                        ]),
                    {
                      key: 'edit',
                      label: 'Edit layout',
                      icon: <Layout size={15} />,
                      onSelect: () => go({ name: 'overlay', id: o.id }),
                    },
                    {
                      key: 'rename',
                      label: 'Rename',
                      icon: <PencilSimple size={15} />,
                      onSelect: () => setRenaming({ o, name: o.name }),
                    },
                    {
                      key: 'regen',
                      label: 'New URL…',
                      icon: <ArrowsClockwise size={15} />,
                      onSelect: () => setRegen(o),
                    },
                    {
                      key: 'del',
                      label: 'Delete',
                      icon: <Trash size={15} />,
                      danger: true,
                      onSelect: () => setRemoving(o),
                    },
                  ]}
                />
              </div>
              <SecretUrl url={o.url} />
              <div className="flex gap-2">
                {usesObs ? (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<ObsIcon size={14} />}
                    busy={adding === o.id}
                    onClick={() => void add(o)}
                    className="flex-1"
                  >
                    Add to OBS
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Plus size={14} weight="bold" />}
                    onClick={() => setToStudio(o)}
                    className="flex-1"
                  >
                    Add to Studio
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => go({ name: 'overlay', id: o.id })}
                  className="flex-1"
                >
                  Edit layout
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddToStudioDialog overlay={toStudio} onClose={() => setToStudio(null)} />

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New overlay"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void create()}>
              Create
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <Field label="Name" error={nameError}>
            {(p) => (
              <Input
                {...p}
                autoFocus
                data-autofocus
                value={name}
                maxLength={60}
                placeholder="Starting soon…"
                onChange={(e) => {
                  setName(e.target.value)
                  setNameError(null)
                }}
              />
            )}
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-[14.5px] font-semibold text-text">Start with</legend>
            {PRESETS.map((p) => (
              <label
                key={p.value}
                className={cx(
                  'flex cursor-pointer gap-3 rounded-[12px] border p-3 transition-colors has-[:focus-visible]:shadow-[var(--fc-focus)]',
                  preset === p.value
                    ? 'fc-picked border-transparent'
                    : 'border-line hover:border-line-strong',
                )}
              >
                <input
                  type="radio"
                  name="preset"
                  value={p.value}
                  checked={preset === p.value}
                  onChange={() => setPreset(p.value)}
                  className="mt-1 accent-[var(--fc-accent)]"
                />
                <span>
                  <span className="block text-sm font-semibold text-text">{p.title}</span>
                  <span className="block text-[14.5px] text-text-2">{p.body}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </form>
      </Dialog>

      <Dialog
        open={regen !== null}
        onClose={() => setRegen(null)}
        size="sm"
        title="Make a new URL?"
        description="Use this if someone saw your URL. The old one stops at once, so press Add to OBS again."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRegen(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={busy === 'regen'}
              onClick={() =>
                regen &&
                void run('regen', () => client.regenerateUrl(regen.id), {
                  success: 'New URL ready. Paste it into the overlay’s Browser source.',
                }).then((o) => {
                  if (o) overlays.set((p) => (p ?? []).map((x) => (x.id === o.id ? o : x)))
                  setRegen(null)
                })
              }
            >
              Make new URL
            </Button>
          </>
        }
      />

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        size="sm"
        title={removing ? `Delete “${removing.name}”?` : 'Delete'}
        description="Its URL stops working and OBS will show nothing for it. Your alert rules stay."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={busy === 'del'}
              onClick={() =>
                removing &&
                void run('del', () => done(client.deleteOverlay(removing.id)), {
                  success: 'Overlay deleted.',
                }).then((ok) => {
                  if (!ok) return
                  overlays.set((p) => (p ?? []).filter((x) => x.id !== removing.id))
                  setRemoving(null)
                })
              }
            >
              Delete
            </Button>
          </>
        }
      />

      <Dialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        size="sm"
        title="Rename overlay"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy === 'rename'}
              onClick={() =>
                renaming &&
                void run(
                  'rename',
                  () => client.saveOverlay({ ...renaming.o, name: renaming.name.trim() }),
                  { success: 'Renamed.' },
                ).then((o) => {
                  if (o) {
                    overlays.set((p) => (p ?? []).map((x) => (x.id === o.id ? o : x)))
                    setRenaming(null)
                  }
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        {renaming && (
          <Field label="Name">
            {(p) => (
              <Input
                {...p}
                autoFocus
                data-autofocus
                value={renaming.name}
                maxLength={60}
                onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
              />
            )}
          </Field>
        )}
      </Dialog>
      {guide}
    </div>
  )
}

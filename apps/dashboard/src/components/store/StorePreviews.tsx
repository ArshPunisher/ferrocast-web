// Visual previews for Store cards & detail inspection: uses the real Ferrocast renderers
// (`ScenePreview`, `WidgetPreview`, `DesignStage`, and p2e sandboxed alert `<iframe sandbox="allow-scripts">`).

import { useMemo, useState } from 'react'
import { LockKey, Play, Sparkle } from '@phosphor-icons/react'
import { previewAlert, type RenderedAlert, type StoreItem } from '@ferrocast/api'
import { Badge, Button, Input } from '@ferrocast/ui'
import { AlertStage } from '../AlertStage'
import { DesignStage } from '../design/DesignStage'
import { ScenePreview, WidgetPreview } from '../design/previews'

function buildCustomAlertSample(item: StoreItem): RenderedAlert | null {
  const ca = item.preview.custom_alert
  if (!ca) return null
  return {
    alert_id: `store-preview-${item.id}`,
    event_id: `store-ev-${item.id}`,
    rule_id: 'store-preview',
    variation_id: item.id,
    kind: 'follow',
    platform: 'twitch',
    title: 'AriLive joined the squad!',
    body: 'Happy to catch the stream!',
    image: null,
    sound: null,
    volume: 0,
    duration_ms: 5000,
    layout: 'stack',
    css: ca.css,
    tts_text: null,
    tts_audio: null,
    test: true,
    custom: {
      html: ca.html,
      css: ca.css,
      fields: { ...ca.field_values },
      vars: { name: 'AriLive', message: 'Happy to catch the stream!', platform: 'twitch' },
    },
  }
}

/** Compact live swatch/mini-preview for catalog cards (renders fast, GPU-friendly). */
export function StoreCardPreview({ item }: { item: StoreItem }) {
  const [c0, c1, c2] = item.preview.palette
  const d = item.preview.design
  if (d?.kind === 'theme' || d?.kind === 'scene') {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-[12px] border border-line bg-surface-2">
        <ScenePreview design={d} lazy className="h-full w-full" />
      </div>
    )
  }
  if (d?.kind === 'widget') {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-[12px] border border-line bg-surface-2">
        <WidgetPreview design={d} lazy className="h-full w-full" />
      </div>
    )
  }
  return (
    <div
      className="relative flex aspect-video w-full flex-col justify-between overflow-hidden rounded-[12px] border border-line p-3.5"
      style={{
        background: `radial-gradient(circle at 20% 20%, color-mix(in srgb, ${c1} 22%, ${c0}), ${c0} 75%)`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/45 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-white/90">
          {item.sandboxed ? (
            <LockKey size={12} aria-hidden="true" />
          ) : (
            <Sparkle size={12} aria-hidden="true" />
          )}
          {item.kind === 'plugin'
            ? `plugin · ${item.plugin_kind ?? 'effect'}`
            : item.package.format}
        </span>
        <span className="flex items-center gap-1" aria-hidden="true">
          {[c0, c1, c2].map((col, idx) => (
            <span
              key={idx}
              className="size-3 rounded-full border border-white/25"
              style={{ background: col }}
            />
          ))}
        </span>
      </div>
      <div className="space-y-1">
        <p
          className="truncate font-display text-[17px] font-extrabold text-white"
          title={item.preview.headline || item.title}
        >
          {item.preview.headline || item.title}
        </p>
        {item.preview.subline && (
          <p className="truncate text-[12.5px] text-white/75" title={item.preview.subline}>
            {item.preview.subline}
          </p>
        )}
      </div>
    </div>
  )
}

/** Full interactive preview inside the Store Item detail view (supports live custom fields & replay). */
export function StoreDetailPreview({ item }: { item: StoreItem }) {
  const d = item.preview.design
  const ca = item.preview.custom_alert
  const [replay, setReplay] = useState(0)
  const [fieldOverrides, setFieldOverrides] = useState<Record<string, string | number | boolean>>(
    () => (ca ? { ...ca.field_values } : {}),
  )

  const designAlert = useMemo(() => {
    if (!d) return null
    if (d.kind === 'alert') return previewAlert(d, 'follow')
    return null
  }, [d])

  const customAlert = useMemo(() => {
    const base = buildCustomAlertSample(item)
    if (!base?.custom) return null
    return {
      ...base,
      custom: {
        ...base.custom,
        fields: { ...base.custom.fields, ...fieldOverrides },
      },
    }
  }, [item, fieldOverrides])

  if (d?.kind === 'alert' && designAlert) {
    return (
      <div className="space-y-2">
        <DesignStage
          alert={designAlert}
          scene="game"
          autoplay
          loop
          label={`${item.title} live alert preview`}
        />
      </div>
    )
  }

  if (d?.kind === 'theme' || d?.kind === 'scene') {
    return (
      <div className="overflow-hidden rounded-panel border border-line bg-surface-2">
        <ScenePreview design={d} live className="aspect-video w-full" />
      </div>
    )
  }

  if (d?.kind === 'widget') {
    return (
      <div className="overflow-hidden rounded-panel border border-line bg-surface-2">
        <WidgetPreview design={d} className="aspect-video w-full" />
      </div>
    )
  }

  if (customAlert && ca) {
    return (
      <div className="space-y-3">
        <div className="relative">
          <AlertStage
            alert={customAlert}
            theme="molten"
            replay={replay}
            controls={false}
            label={`${item.title} sandboxed preview`}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Badge tone="accent">
              <LockKey size={12} aria-hidden="true" />
              <span>
                Rendered in a sandboxed frame: no fetching, pictures only from approved hosts
              </span>
            </Badge>
            <Button size="sm" variant="secondary" onClick={() => setReplay((n) => n + 1)}>
              <Play size={14} weight="fill" aria-hidden="true" />
              Replay alert
            </Button>
          </div>
        </div>
        {ca.fields.length > 0 && (
          <div className="rounded-control border border-line bg-surface-2 p-3">
            <p className="mb-2 text-[12.5px] font-semibold uppercase tracking-wide text-text-3">
              Try custom fields before installing
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ca.fields.map((f) => {
                const val = fieldOverrides[f.key] ?? f.default
                const Field = f.type === 'color' ? 'div' : 'label'
                return (
                  <Field
                    key={f.key}
                    role={f.type === 'color' ? 'group' : undefined}
                    aria-label={f.type === 'color' ? f.label : undefined}
                    className="flex flex-col gap-1 text-[13px] text-text-2"
                  >
                    <span className="font-medium">{f.label}</span>
                    {f.type === 'color' ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label={f.label}
                          value={String(val)}
                          onChange={(e) =>
                            setFieldOverrides((prev) => ({ ...prev, [f.key]: e.target.value }))
                          }
                          className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent p-0.5"
                        />
                        <Input
                          aria-label={`${f.label} value`}
                          value={String(val)}
                          onChange={(e) =>
                            setFieldOverrides((prev) => ({ ...prev, [f.key]: e.target.value }))
                          }
                          className="font-mono text-[12.5px]"
                        />
                      </div>
                    ) : (
                      <Input
                        value={String(val)}
                        onChange={(e) =>
                          setFieldOverrides((prev) => ({ ...prev, [f.key]: e.target.value }))
                        }
                      />
                    )}
                  </Field>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  return <StoreCardPreview item={item} />
}

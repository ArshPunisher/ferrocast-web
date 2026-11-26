import {
  MAX_OVERLAY_WIDGETS,
  SCENE_LABEL,
  type Overlay,
  type ThemeDesign,
  type Widget,
} from '@ferrocast/api'

export type FunctionalWidget = Exclude<Widget, { kind: 'layer' }>

export interface ThemePart {
  key: string
  label: string
  sceneKey: string
  sceneName: string
  sceneWidth: number
  sceneHeight: number
  widget: FunctionalWidget
}

const KIND_LABEL: Record<FunctionalWidget['kind'], string> = {
  chat: 'Chat box',
  alerts: 'Alert box',
  events: 'Event list',
  goal: 'Goal bar',
  label: 'Stream label',
  viewers: 'Viewer count',
  poll: 'Poll',
  giveaway: 'Giveaway',
  end_credits: 'End credits',
  emote_wall: 'Emote wall',
  chat_highlight: 'Highlighted chat',
}

const LABEL_PRESET_NAME: Record<string, string> = {
  latest_follower: 'Latest follower',
  latest_sub: 'Latest sub',
  latest_tip: 'Latest tip',
  latest_cheer: 'Latest cheer',
  top_tip_session: 'Top tip',
  follower_count: 'Follower count',
  sub_count: 'Sub count',
}

function widgetLabel(w: FunctionalWidget): string {
  if (w.kind === 'label') {
    const source = (w.config as { source?: unknown }).source
    if (typeof source === 'string' && source) {
      return (
        LABEL_PRESET_NAME[source] ??
        source
          .split('_')
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(' ')
      )
    }
  }
  return KIND_LABEL[w.kind]
}

function dedupeSignature(w: FunctionalWidget): string {
  const cfg = w.config as { source?: unknown; style?: { variant?: unknown } }
  if (w.kind === 'label') return `label:${String(cfg.source ?? w.id)}`
  return `${w.kind}:${String(cfg.style?.variant ?? 'default')}`
}

/**
 * Collects distinct functional widgets across a theme's screens so one can be copied into an
 * existing overlay without importing whole screens or decorative artwork layers.
 */
export function extractThemeParts(theme: ThemeDesign): ThemePart[] {
  const seen = new Set<string>()
  const parts: ThemePart[] = []
  for (const screen of theme.content.scenes) {
    const sceneName = screen.name || SCENE_LABEL[screen.key] || screen.key
    for (const layer of screen.layers) {
      if (layer.kind === 'layer') continue
      const sig = dedupeSignature(layer)
      if (seen.has(sig)) continue
      seen.add(sig)
      parts.push({
        key: `${screen.key}:${layer.id}`,
        label: widgetLabel(layer),
        sceneKey: screen.key,
        sceneName,
        sceneWidth: screen.width,
        sceneHeight: screen.height,
        widget: layer,
      })
    }
  }
  return parts
}

function uniqueWidgetId(base: string, existingIds: ReadonlySet<string>): string {
  const clean = base.trim() || 'widget'
  if (!existingIds.has(clean)) return clean
  for (let i = 2; ; i++) {
    const candidate = `${clean}-${i}`
    if (!existingIds.has(candidate)) return candidate
  }
}

/**
 * Returns an updated overlay with `part` scaled proportionally to the overlay's canvas and given
 * a unique widget id.
 */
export function addPartToOverlay(overlay: Overlay, part: ThemePart, theme: ThemeDesign): Overlay {
  if (overlay.widgets.length >= MAX_OVERLAY_WIDGETS) {
    throw new Error(
      `That overlay already has ${MAX_OVERLAY_WIDGETS} widgets, the most one can hold. Remove one first.`,
    )
  }
  const sx = overlay.width / Math.max(1, part.sceneWidth)
  const sy = overlay.height / Math.max(1, part.sceneHeight)
  const minW = Math.min(20, overlay.width)
  const minH = Math.min(20, overlay.height)
  const w = Math.max(minW, Math.min(overlay.width, Math.round(part.widget.w * sx)))
  const h = Math.max(minH, Math.min(overlay.height, Math.round(part.widget.h * sy)))
  const x = Math.max(0, Math.min(overlay.width - w, Math.round(part.widget.x * sx)))
  const y = Math.max(0, Math.min(overlay.height - h, Math.round(part.widget.y * sy)))

  const existingIds = new Set(overlay.widgets.map((item) => item.id))
  const id = uniqueWidgetId(part.widget.id || part.widget.kind, existingIds)
  const cloned = structuredClone(part.widget)
  const nextWidget = {
    ...cloned,
    id,
    x,
    y,
    w,
    h,
    config: {
      ...cloned.config,
      design_id: theme.id,
      ...(theme.branded ? { branded: true } : {}),
    },
  } as Widget

  return {
    ...overlay,
    widgets: [...overlay.widgets, nextWidget],
  }
}

import {
  ApiError,
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
  return `${w.kind}:${String(cfg.style?.variant ?? 'default')}:${Math.round(w.w)}x${Math.round(w.h)}`
}

/**
 * Collects distinct functional widgets across a theme's screens so one can be copied into an
 * existing overlay without importing whole screens or decorative artwork layers. Alert widgets
 * are excluded because a theme's alert styling lives in its separate alert design, not here.
 */
export function extractThemeParts(theme: ThemeDesign): ThemePart[] {
  const seen = new Set<string>()
  const parts: ThemePart[] = []
  for (const screen of theme.content.scenes) {
    const sceneName = screen.name || SCENE_LABEL[screen.key] || screen.key
    for (const layer of screen.layers) {
      if (layer.kind === 'layer' || layer.kind === 'alerts') continue
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

function fitPartSize(
  overlay: Overlay,
  part: ThemePart,
): { ok: true; w: number; h: number; sx: number; sy: number } | { ok: false; error: string } {
  const sx = overlay.width / Math.max(1, part.sceneWidth)
  const sy = overlay.height / Math.max(1, part.sceneHeight)
  const origW = Math.max(1, part.widget.w)
  const origH = Math.max(1, part.widget.h)
  const minW = Math.min(20, overlay.width)
  const minH = Math.min(20, overlay.height)
  const minScale = Math.max(minW / origW, minH / origH)
  const maxScale = Math.min(overlay.width / origW, overlay.height / origH)
  if (minScale > maxScale) {
    return {
      ok: false,
      error: `${part.label} (${origW}×${origH}) cannot fit on ${overlay.name} (${overlay.width}×${overlay.height}) without stretching.`,
    }
  }
  const scale = Math.max(minScale, Math.min(maxScale, Math.min(sx, sy)))
  return {
    ok: true,
    w: Math.round(origW * scale),
    h: Math.round(origH * scale),
    sx,
    sy,
  }
}

/** Returns a plain message when `part` cannot be scaled uniformly to fit inside `overlay`. */
export function partFitError(overlay: Overlay, part: ThemePart): string | null {
  const fit = fitPartSize(overlay, part)
  return fit.ok ? null : fit.error
}

/**
 * Returns an updated overlay with `part` scaled proportionally to the overlay's canvas and given
 * a unique widget id.
 */
export function addPartToOverlay(overlay: Overlay, part: ThemePart, theme: ThemeDesign): Overlay {
  if (overlay.widgets.length >= MAX_OVERLAY_WIDGETS) {
    throw new ApiError(
      400,
      'invalid',
      `That overlay already has ${MAX_OVERLAY_WIDGETS} widgets, the most one can hold. Remove one first.`,
    )
  }
  const fit = fitPartSize(overlay, part)
  if (!fit.ok) {
    throw new ApiError(400, 'invalid', fit.error)
  }
  const { w, h, sx, sy } = fit
  const x = Math.max(0, Math.min(overlay.width - w, Math.round(part.widget.x * sx)))
  const y = Math.max(0, Math.min(overlay.height - h, Math.round(part.widget.y * sy)))

  const existingIds = new Set(overlay.widgets.map((item) => item.id))
  const id = uniqueWidgetId(part.widget.id || part.widget.kind, existingIds)
  const cloned = structuredClone(part.widget)
  cloned.id = id
  cloned.x = x
  cloned.y = y
  cloned.w = w
  cloned.h = h
  const cfg = cloned.config as { design_id?: string; branded?: boolean }
  cfg.design_id = theme.id
  if (theme.branded) cfg.branded = true
  else delete cfg.branded

  return {
    ...overlay,
    widgets: [...overlay.widgets, cloned],
  }
}

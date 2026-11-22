// Local performance scorer (Phase 3 #18): computes a machine-local render cost score for
// Store overlays, themes, alerts, and widgets inside a temporary hidden test container using
// the real Ferrocast renderer. Runs strictly locally with zero network calls or telemetry.

import type { Design, Overlay, StoreItem } from '@ferrocast/api'
import { buildDesignAlert, createOverlay, type OverlayRuntime } from '@ferrocast/overlays'

export interface LocalPerfReport {
  score: number
  tier: 'light' | 'balanced' | 'heavy'
  label: string
  mountMs: number
  nodeCount: number
  layerCount: number
  hasBlurOrFx: boolean
  measuredAt: number
  summary: string
}

const CACHE = new Map<string, LocalPerfReport>()

function analyzeDesignComplexity(d: Design): { layers: number; hasBlurOrFx: boolean } {
  if (d.kind === 'theme') {
    const layers = d.content.scenes.reduce((acc, s) => acc + s.layers.length, 0)
    const hasBlurOrFx = d.content.scenes.some((s) =>
      s.layers.some((w) => JSON.stringify(w.config).includes('blur') || w.kind === 'alerts'),
    )
    return { layers, hasBlurOrFx }
  }
  if (d.kind === 'scene') {
    const hasBlurOrFx = d.content.layers.some((w) => JSON.stringify(w.config).includes('blur'))
    return { layers: d.content.layers.length, hasBlurOrFx }
  }
  if (d.kind === 'widget') {
    return { layers: 1, hasBlurOrFx: false }
  }
  const hasBlurOrFx = Object.values(d.content.events).some((ev) =>
    ev?.variations.some(
      (v) =>
        (v.look.motion?.particles ?? 'none') !== 'none' || v.look.css.includes('backdrop-filter'),
    ),
  )
  return { layers: 4, hasBlurOrFx }
}

function buildBenchOverlay(d: Design): Overlay | null {
  if (d.kind === 'theme') {
    const s = d.content.scenes[0]
    if (!s) return null
    return {
      id: `bench-${d.id}`,
      name: s.name,
      url: '',
      width: s.width,
      height: s.height,
      widgets: s.layers,
      updated_at: 0,
      design: null,
    }
  }
  if (d.kind === 'scene') {
    return {
      id: `bench-${d.id}`,
      name: d.name,
      url: '',
      width: d.content.width,
      height: d.content.height,
      widgets: d.content.layers,
      updated_at: 0,
      design: null,
    }
  }
  if (d.kind === 'widget') {
    return {
      id: `bench-${d.id}`,
      name: d.name,
      url: '',
      width: Math.max(320, d.content.w + 80),
      height: Math.max(180, d.content.h + 80),
      widgets: [
        {
          id: 'w-bench',
          kind: d.content.widget,
          x: 40,
          y: 40,
          w: d.content.w,
          h: d.content.h,
          config: {
            ...d.content.config,
            style: d.content.style,
          },
        } as Overlay['widgets'][number],
      ],
      updated_at: 0,
      design: null,
    }
  }
  return null
}

function scoreFromMetrics(
  mountMs: number,
  nodeCount: number,
  layerCount: number,
  pkgBytes: number,
  hasBlurOrFx: boolean,
): LocalPerfReport {
  const timePenalty = Math.min(28, Math.max(0, (mountMs - 2) * 1.4))
  const domPenalty = Math.min(24, Math.max(0, (nodeCount - 12) * 0.25))
  const layerPenalty = Math.min(18, Math.max(0, (layerCount - 2) * 1.8))
  const sizePenalty = Math.min(14, (pkgBytes / (1024 * 1024)) * 3)
  const fxPenalty = hasBlurOrFx ? 6 : 0
  const score = Math.round(
    Math.max(
      15,
      Math.min(100, 100 - timePenalty - domPenalty - layerPenalty - sizePenalty - fxPenalty),
    ),
  )
  const tier: LocalPerfReport['tier'] = score >= 82 ? 'light' : score >= 58 ? 'balanced' : 'heavy'
  const label = tier === 'light' ? 'Featherweight' : tier === 'balanced' ? 'Balanced' : 'Demanding'
  const roundedMs = Math.round(mountMs * 10) / 10
  return {
    score,
    tier,
    label,
    mountMs: roundedMs,
    nodeCount,
    layerCount,
    hasBlurOrFx,
    measuredAt: Date.now(),
    summary: `${roundedMs} ms local mount · ${nodeCount} nodes · ${layerCount} layers${hasBlurOrFx ? ' · GPU FX' : ''}`,
  }
}

/**
 * Benchmarks an item's real overlay/alert DOM & runtime cost in an offscreen hidden test host
 * on this computer. Returns cached result unless `force` is true.
 */
export function measureItemLocally(item: StoreItem, force = false): LocalPerfReport {
  const key = `${item.id}@${item.version}`
  if (!force) {
    const cached = CACHE.get(key)
    if (cached) return cached
  }

  let mountMs = 1.2
  let nodeCount = Math.max(4, (item.preview.layers_hint ?? 2) * 4)
  let layerCount = item.preview.layers_hint ?? 2
  let hasBlurOrFx = item.kind === 'plugin'

  if (typeof document !== 'undefined' && typeof performance !== 'undefined') {
    const hidden = document.createElement('div')
    hidden.setAttribute('aria-hidden', 'true')
    hidden.dataset.storePerfHost = item.id
    hidden.style.cssText =
      'position:fixed;left:-99999px;top:-99999px;width:640px;height:360px;overflow:hidden;visibility:hidden;pointer-events:none;'
    document.body.appendChild(hidden)

    let rt: OverlayRuntime | null = null
    let designAlertCleanup: (() => void) | null = null
    const t0 = performance.now()
    try {
      const design = item.preview.design
      if (design) {
        const complexity = analyzeDesignComplexity(design)
        layerCount = Math.max(1, complexity.layers)
        hasBlurOrFx = complexity.hasBlurOrFx
        const ov = buildBenchOverlay(design)
        if (ov) {
          rt = createOverlay(hidden, { audio: false, fit: 'contain', lowMotion: true })
          rt.apply({
            v: 1,
            seq: 1,
            type: 'snapshot',
            data: {
              overlay: ov,
              state: { goals: [], labels: {}, viewers: {}, events: [], chat: [] },
            },
          })
          hidden.getBoundingClientRect()
          nodeCount = Math.max(nodeCount, hidden.querySelectorAll('*').length)
        } else if (design.kind === 'alert') {
          const v = design.content.events.follow?.variations[0]
          if (v) {
            const built = buildDesignAlert(
              {
                alert_id: 'bench',
                event_id: 'bench',
                rule_id: 'bench',
                variation_id: v.id,
                kind: 'follow',
                platform: 'twitch',
                title: v.look.title,
                body: v.look.body,
                image: null,
                sound: null,
                volume: 0,
                duration_ms: v.look.duration_ms,
                layout: 'design',
                css: '',
                tts_text: null,
                tts_audio: null,
                test: true,
                design: {
                  design_id: design.id,
                  variation_id: v.id,
                  event_key: 'follow',
                  branded: false,
                  look: v.look,
                  title_parts: [{ text: 'AriLive just followed', hl: false }],
                  body_parts: [{ text: 'Ready to play!', hl: false }],
                },
              },
              { lowMotion: true },
            )
            hidden.appendChild(built.host)
            built.start()
            designAlertCleanup = built.destroy
            hidden.getBoundingClientRect()
            const domRoot = built.host.shadowRoot ?? built.host
            nodeCount = Math.max(nodeCount, domRoot.querySelectorAll('*').length + 4)
          }
        }
      } else if (item.preview.custom_alert) {
        const ca = item.preview.custom_alert
        hasBlurOrFx =
          ca.css.includes('backdrop-filter') ||
          ca.css.includes('@keyframes') ||
          ca.css.includes('filter:')
        // The alert is untrusted: it is only read as data, in a document that is never shown
        // (a DOMParser document runs no script and loads nothing). Its HTML and CSS never go into
        // this page, where they would load pictures and frames and could style the dashboard.
        const doc = new DOMParser().parseFromString(ca.html, 'text/html')
        nodeCount = Math.max(4, doc.body.querySelectorAll('*').length)
        layerCount = Math.max(layerCount, doc.body.children.length)
        // The cost of its styling, counted from the text: rules, animations and filters.
        const rules = (ca.css.match(/\{/g) ?? []).length
        const animations = (ca.css.match(/@keyframes/g) ?? []).length
        nodeCount += Math.min(40, Math.floor(rules / 2) + animations * 2)
      }
      mountMs = Math.max(0.2, performance.now() - t0)
    } catch {
      mountMs = Math.max(0.5, performance.now() - t0)
    } finally {
      designAlertCleanup?.()
      rt?.destroy()
      hidden.remove()
    }
  }

  const report = scoreFromMetrics(mountMs, nodeCount, layerCount, item.package.size, hasBlurOrFx)
  CACHE.set(key, report)
  return report
}

export function clearLocalPerfCache(): void {
  CACHE.clear()
}

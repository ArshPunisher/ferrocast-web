import { ALLOWED_ASSET_HOSTS } from '@ferrocast/api/alert'
import type { CustomAlertRender, CustomFieldValue } from '@ferrocast/api/types'
import bootstrapSource from './alert-sandbox-bootstrap.js?raw'

const MAX_HTML_LEN = 80_000
const MAX_CSS_LEN = 80_000
const MAX_KEYS = 64
const MAX_FIELDS = 32
const VALID_FIELD_KEY = /^[a-z][a-z0-9_]{0,39}$/

export interface ValidatedCustomPayload {
  alert_id: string
  html: string
  css: string
  vars: Record<string, string>
  fields: Record<string, CustomFieldValue>
}

/** The frame's policy: only the bootstrap (by nonce) may run; nothing is fetched but pictures. */
export function customAlertCsp(nonce = ''): string {
  const assetHosts = ALLOWED_ASSET_HOSTS.filter((u) => !u.includes('fonts.gstatic')).join(' ')
  return [
    "default-src 'none'",
    nonce ? `script-src 'nonce-${nonce}'` : "script-src 'none'",
    "style-src 'unsafe-inline'",
    `img-src data: blob: ${assetHosts}`,
    'font-src data: https://fonts.gstatic.com',
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ')
}

export function validateCustomRenderPayload(
  alertId: string,
  custom: CustomAlertRender,
): ValidatedCustomPayload | null {
  if (!custom || typeof custom !== 'object') return null
  if (typeof custom.html !== 'string' || custom.html.length > MAX_HTML_LEN) return null
  if (typeof custom.css !== 'string' || custom.css.length > MAX_CSS_LEN) return null

  const vars: Record<string, string> = {}
  if (custom.vars && typeof custom.vars === 'object' && !Array.isArray(custom.vars)) {
    let count = 0
    for (const [k, v] of Object.entries(custom.vars)) {
      if (count >= MAX_KEYS) break
      if (/^[a-zA-Z0-9_:]{1,40}$/.test(k) && typeof v === 'string') {
        vars[k] = Array.from(v).slice(0, 2000).join('')
        count += 1
      }
    }
  }

  const fields: Record<string, CustomFieldValue> = {}
  if (custom.fields && typeof custom.fields === 'object' && !Array.isArray(custom.fields)) {
    let count = 0
    for (const [k, v] of Object.entries(custom.fields)) {
      if (count >= MAX_FIELDS) break
      if (!VALID_FIELD_KEY.test(k)) continue
      if (typeof v === 'string') {
        fields[k] = Array.from(v).slice(0, 500).join('')
        count += 1
      } else if (typeof v === 'number' && Number.isFinite(v)) {
        fields[k] = v
        count += 1
      } else if (typeof v === 'boolean') {
        fields[k] = v
        count += 1
      }
    }
  }

  return {
    alert_id: String(alertId || '').slice(0, 120),
    html: custom.html,
    css: custom.css,
    vars,
    fields,
  }
}

function randomNonce(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

function attrEscape(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** The frame's page when the host has no `/alert-sandbox` route: same bootstrap, same rules. */
export function buildSandboxSrcdoc(parentOrigin: string, nonce = randomNonce()): string {
  const csp = customAlertCsp(nonce)
  return (
    `<!doctype html><html data-parent="${attrEscape(parentOrigin || '')}"><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${attrEscape(csp)}">` +
    '<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent;display:flex;align-items:center;justify-content:center}#fc-custom-root{width:100%;height:100%;display:flex;align-items:center;justify-content:center;position:relative}</style>' +
    '<style id="fc-custom-style"></style><div id="fc-custom-root" role="status" aria-live="polite"></div>' +
    `<script nonce="${nonce}">${bootstrapSource.replace(/<\/script/gi, '<\\/script')}</script></html>`
  )
}

/**
 * Mounts custom HTML/CSS strictly inside a `sandbox="allow-scripts"` iframe without
 * `allow-same-origin`, verifying origin === 'null' and source identity on postMessage.
 */
export function mountSandboxedAlert(
  container: HTMLElement,
  alertId: string,
  custom: CustomAlertRender,
): () => void {
  const iframe = document.createElement('iframe')
  iframe.className = 'al-custom-frame'
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.setAttribute('referrerpolicy', 'no-referrer')
  iframe.setAttribute('title', 'Custom alert')

  const payload = validateCustomRenderPayload(alertId, custom)
  let loads = 0
  let stopped = false
  let sent = false

  // One handshake: the frame says it is ready, the payload goes once. (The frame has an
  // opaque origin, so the only possible target origin for this direction is '*'; the
  // message goes to that one window, never broadcast.)
  const onMessage = (ev: MessageEvent) => {
    const win = iframe.contentWindow
    if (stopped || sent || !payload || !win || ev.source !== win || ev.origin !== 'null') return
    const data = ev.data as { type?: unknown } | null
    if (data?.type !== 'ferro-custom-alert-ready') return
    sent = true
    win.postMessage({ type: 'ferro-custom-alert', payload }, '*')
  }

  const onLoad = () => {
    loads += 1
    if (loads > 1) {
      // The frame navigated itself: drop it.
      iframe.remove()
      stopped = true
    }
  }

  window.addEventListener('message', onMessage)
  iframe.addEventListener('load', onLoad)

  const engineSandbox =
    typeof document !== 'undefined' ? document.documentElement?.dataset?.fcSandbox : undefined
  const isOverlayEngineRoute =
    typeof location !== 'undefined' && location.pathname.startsWith('/o/')
  const here = typeof location !== 'undefined' ? location.origin : ''
  const sandboxPath =
    engineSandbox && engineSandbox.startsWith('/')
      ? engineSandbox
      : isOverlayEngineRoute
        ? '/alert-sandbox'
        : null
  if (sandboxPath) {
    iframe.src = `${sandboxPath}?origin=${encodeURIComponent(here)}`
  } else {
    iframe.srcdoc = buildSandboxSrcdoc(here)
  }

  container.appendChild(iframe)

  return () => {
    stopped = true
    window.removeEventListener('message', onMessage)
    iframe.removeEventListener('load', onLoad)
    iframe.remove()
  }
}

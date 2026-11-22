import { ALLOWED_ASSET_HOSTS } from '@ferrocast/api/alert'
import type { CustomAlertRender, CustomFieldValue } from '@ferrocast/api/types'

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

export function customAlertCsp(): string {
  const assetHosts = ALLOWED_ASSET_HOSTS.filter((u) => !u.includes('fonts.gstatic')).join(' ')
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    `img-src data: blob: ${assetHosts}`,
    'media-src data: blob:',
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
        vars[k] = v.slice(0, 2000)
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
        fields[k] = v.slice(0, 500)
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

export function buildSandboxSrcdoc(expectedOrigin: string): string {
  const csp = customAlertCsp()
  const originLiteral = JSON.stringify(expectedOrigin || '')
  return (
    `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">` +
    '<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent;display:flex;align-items:center;justify-content:center}#fc-custom-root{width:100%;height:100%;display:flex;align-items:center;justify-content:center;position:relative}</style>' +
    '<style id="fc-custom-style"></style><div id="fc-custom-root" role="status" aria-live="polite"></div>' +
    `<script>(function(){var root=document.getElementById('fc-custom-root');var styleEl=document.getElementById('fc-custom-style');var expectedOrigin=${originLiteral};` +
    "function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;').replace(/`/g,'&#96;')}" +
    "function validFieldKey(k){return typeof k==='string'&&/^[a-z][a-z0-9_]{0,39}$/.test(k)}" +
    "function isObj(v){return typeof v==='object'&&v!==null&&!Array.isArray(v)}" +
    "function validatePayload(msg){if(!isObj(msg)||msg.type!=='ferro-custom-alert')return null;var p=msg.payload;if(!isObj(p)||typeof p.html!=='string'||p.html.length>80000||typeof p.css!=='string'||p.css.length>80000||!isObj(p.vars)||!isObj(p.fields))return null;return p}" +
    "function renderTokens(html,vars,fields){var map=Object.create(null);for(var k in vars)if(Object.prototype.hasOwnProperty.call(vars,k)&&typeof vars[k]==='string')map[k]=vars[k];for(var fk in fields)if(Object.prototype.hasOwnProperty.call(fields,fk)&&validFieldKey(fk)){var fv=fields[fk];if(typeof fv==='string'||typeof fv==='number'||typeof fv==='boolean')map[fk]=String(fv)}return html.replace(/\\{\\{?([a-zA-Z0-9_]+)(?:\\|([^}]*))?\\}?\\}/g,function(full,name,filt){if(full.indexOf('{{')===0)return full.slice(1,-1);if(Object.prototype.hasOwnProperty.call(map,name)&&map[name]!=='')return esc(map[name]);if(filt&&filt.indexOf('default:')===0)return esc(filt.slice(8).replace(/^[\"']|[\"']$/g,''));return ''})}" +
    "function safeCssVal(v){var s=String(v==null?'':v);if(/[;{}<>]|url\\s*\\(|@import|expression\\s*\\(|javascript:/i.test(s))return '';return s}" +
    "window.addEventListener('message',function(ev){if(ev.source!==window.parent)return;if(expectedOrigin&&expectedOrigin!=='null'&&ev.origin!==expectedOrigin)return;var p=validatePayload(ev.data);if(!p)return;var decls=[];for(var fk in p.fields)if(Object.prototype.hasOwnProperty.call(p.fields,fk)&&validFieldKey(fk)){var sv=safeCssVal(p.fields[fk]);if(sv!=='')decls.push('--field-'+fk+':'+sv+';')}styleEl.textContent=(decls.length?':root{'+decls.join('')+'}\\n':'')+p.css;while(root.firstChild)root.removeChild(root.firstChild);var frag=document.createRange().createContextualFragment(renderTokens(p.html,p.vars,p.fields));root.appendChild(frag);window.parent.postMessage({type:'ferro-custom-alert-rendered',id:p.alert_id||''},'*')});" +
    "window.parent.postMessage({type:'ferro-custom-alert-ready'},'*');})();</script>"
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

  const sendPayload = () => {
    if (stopped || !payload || loads > 1) return
    iframe.contentWindow?.postMessage({ type: 'ferro-custom-alert', payload }, '*')
  }

  const onMessage = (ev: MessageEvent) => {
    const win = iframe.contentWindow
    if (stopped || !win || ev.source !== win || ev.origin !== 'null' || loads > 1) return
    const data = ev.data as { type?: unknown } | null
    if (data?.type === 'ferro-custom-alert-ready') sendPayload()
  }

  const onLoad = () => {
    loads += 1
    if (loads > 1) {
      // Sandboxed frame attempted navigation: refuse to run untrusted page.
      iframe.remove()
      stopped = true
      return
    }
    sendPayload()
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

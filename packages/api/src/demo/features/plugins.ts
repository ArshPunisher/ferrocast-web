// Plugins in the demo (`/plugins`, API.md "Plugins"): the same checks as the PC's, except
// that WGSL isn't compiled here (an effect only needs its `effect` function and no endless
// loop). Starts with one plugin so the page has something to show.

import { unzipSync, strFromU8 } from 'fflate'
import type { Plugin } from '../../plugins'
import { MAX_PLUGIN_BYTES } from '../../plugins'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type Routed } from './host'

const MAX_ENTRY = 512 * 1024
const MAX_ENTRIES = 20
const ALLOWED = ['json', 'wgsl', 'md', 'txt', 'png', 'wasm', 'html']
const KIND_FILE: Record<string, string> = { effect: 'wgsl', logic: 'wasm', panel: 'html' }
const ACTIONS = ['scene', 'show', 'hide', 'filter', 'save_replay', 'record', 'chat']
const ID = /^[a-z][a-z0-9._-]{2,63}$/

/** The plugin the demo starts with. */
const SAMPLE: Plugin = {
  id: 'com.ferrocast.sample.scanlines',
  name: 'Scanlines',
  version: '1.0.0',
  author: 'Ferrocast',
  description: 'Thin lines across the picture, like an old monitor.',
  kind: 'effect',
  actions: [],
  on: true,
  problem: null,
}

/** A panel the demo starts with: two buttons. */
const PANEL: Plugin = {
  id: 'com.ferrocast.sample.buttons',
  name: 'Big buttons',
  version: '1.0.0',
  author: 'Ferrocast',
  description: 'Two big buttons for your stream deck screen.',
  kind: 'panel',
  actions: ['save_replay', 'scene'],
  on: true,
  problem: null,
}

/** The demo's catalog: one plugin to add, and a newer Big buttons. */
const CATALOG: Omit<Plugin, 'on' | 'problem'>[] = [
  {
    id: 'com.ferrocast.grain',
    name: 'Film grain',
    version: '1.0.0',
    author: 'Ferrocast',
    description: 'Soft moving grain, like old film.',
    kind: 'effect',
    actions: [],
  },
  { ...PANEL, version: '1.1.0', description: 'Two big buttons, now in your colour.' },
]

/** Which of two versions is later (numbers dot by dot). */
function newer(a: string, b: string): boolean {
  const n = (v: string) => v.split('.').map((x) => Number(x) || 0)
  const [x, y] = [n(a), n(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  }
  return false
}

const PANEL_HTML = `<!doctype html><style>body{font:600 15px system-ui;margin:12px;display:flex;gap:8px;color:#222}button{flex:1;padding:18px;border-radius:12px;border:0;background:#1f5aff;color:#fff;font:inherit}</style>
<button id=r>Save replay</button><button id=s>Go to BRB</button><p id=o></p>
<script>
const say=(t)=>document.getElementById('o').textContent=t
r.onclick=()=>parent.postMessage({type:'act',step:{type:'save_replay'}},'*')
s.onclick=()=>parent.postMessage({type:'act',step:{type:'scene',name:'BRB'}},'*')
addEventListener('message',(e)=>{if(e.data&&e.data.type==='done')say('Done.');if(e.data&&e.data.type==='error')say(e.data.message)})
</script>`

function refused(status: number, code: string, message: string, hint: string): HttpError {
  return new HttpError(status, code, message, hint)
}

export class DemoPlugins {
  private list: Plugin[] = [clone(PANEL), clone(SAMPLE)]
  private pages = new Map<string, { html: string; actions: string[] }>([
    [PANEL.id, { html: PANEL_HTML, actions: PANEL.actions }],
  ])

  /** The effects of the plugins that are on (the Effect list shows them). */
  effects(): { id: string; name: string }[] {
    return this.list
      .filter((p) => p.on && !p.problem && p.kind === 'effect')
      .map((p) => ({ id: p.id, name: p.name }))
  }

  private find(id: string): Plugin {
    const p = this.list.find((x) => x.id === id)
    if (!p)
      throw new HttpError(
        404,
        'plugin_not_found',
        'There’s no such plugin installed.',
        'Refresh the list of plugins.',
      )
    return p
  }

  private async install(body: unknown): Promise<Plugin> {
    if (!(body instanceof FormData))
      throw new HttpError(
        415,
        'wrong_content_type',
        'Send the plugin as multipart/form-data in a field named "file".',
      )
    const file = body.get('file')
    if (!(file instanceof Blob))
      throw new HttpError(400, 'invalid', 'Attach the plugin’s .zip in a form field named "file".')
    if (file.size === 0)
      throw new HttpError(400, 'invalid', 'The file is empty.', 'Pick the plugin’s .zip file.')
    if (file.size > MAX_PLUGIN_BYTES)
      throw refused(
        413,
        'plugin_too_big',
        `Plugins are up to ${MAX_PLUGIN_BYTES / 1024} KB.`,
        'Ask its maker for a smaller one.',
      )
    const notOne = (why: string) =>
      refused(
        415,
        'plugin_not_a_plugin',
        `That isn’t a Ferrocast plugin: ${why}.`,
        'Pick the plugin’s .zip file.',
      )
    let entries: Record<string, Uint8Array>
    try {
      entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
    } catch {
      throw notOne('it isn’t a zip file')
    }
    const files = new Map<string, Uint8Array>()
    const names = Object.keys(entries).filter((n) => !n.endsWith('/'))
    if (names.length > MAX_ENTRIES)
      throw notOne(`it holds ${names.length} files; a plugin holds up to ${MAX_ENTRIES}`)
    for (const raw of names) {
      const parts = raw.split('/').filter(Boolean)
      if (parts.some((p) => p === '..' || p === '.') || raw.startsWith('/') || parts.length > 2)
        throw notOne(`"${raw}" is outside the plugin’s folder`)
      const name = parts[parts.length - 1] ?? raw
      const ext = name.split('.').pop()?.toLowerCase() ?? ''
      if (!ALLOWED.includes(ext))
        throw refused(
          415,
          'plugin_file_type',
          `The plugin holds "${name}"; plugins hold only .json, .wgsl, .wasm, .html, .md, .txt and .png files.`,
          'Plugins can’t bring programs. Ask its maker for an effect plugin.',
        )
      const bytes = entries[raw] ?? new Uint8Array()
      if (bytes.length > MAX_ENTRY)
        throw refused(
          413,
          'plugin_too_big',
          `"${name}" in the plugin is bigger than ${MAX_ENTRY / 1024} KB.`,
          'Ask its maker for a smaller one.',
        )
      files.set(name, bytes)
    }
    const manifest = files.get('plugin.json')
    if (!manifest) throw notOne('it has no plugin.json')
    let m: Record<string, unknown>
    try {
      m = JSON.parse(strFromU8(manifest)) as Record<string, unknown>
    } catch {
      throw notOne('its plugin.json is wrong')
    }
    const text = (k: string) => (typeof m[k] === 'string' ? (m[k] as string) : '')
    const wrong = (why: string) =>
      refused(
        422,
        'plugin_manifest',
        `The plugin’s plugin.json is wrong: ${why}.`,
        'Ask its maker to fix it.',
      )
    if (!ID.test(text('id')) || text('id').includes('..'))
      throw wrong(`its id "${text('id')}" isn’t one`)
    if (!text('name').trim() || text('name').length > 60)
      throw wrong('its name is empty or longer than 60 characters')
    if (!text('version').trim() || text('version').length > 20)
      throw wrong('its version is empty or longer than 20 characters')
    const kind = text('kind')
    const ext = KIND_FILE[kind]
    if (!ext)
      throw wrong(`it’s a "${kind}" plugin; this Ferrocast takes effect, logic and panel plugins`)
    const actions = Array.isArray(m.actions) ? (m.actions as unknown[]).map(String) : []
    if (kind === 'effect' && actions.length) throw wrong('an effect can’t ask for actions')
    const bad = actions.find((a) => !ACTIONS.includes(a))
    if (bad) throw wrong(`it asks for "${bad}", which isn’t an action plugins can have`)
    for (const n of files.keys()) {
      const e = n.split('.').pop()?.toLowerCase() ?? ''
      if (!['json', 'md', 'txt', 'png', ext].includes(e))
        throw refused(
          415,
          'plugin_file_type',
          `The plugin holds "${n}", which a ${kind} plugin doesn’t use.`,
          'Ask its maker for a plugin without it.',
        )
    }
    const key = kind === 'logic' ? 'module' : kind === 'panel' ? 'panel' : 'effect'
    const main = files.get(text(key))
    if (!text(key).endsWith(`.${ext}`) || !main)
      throw notOne(`its ${kind} "${text(key)}" isn’t in it`)
    const done = (): Plugin => {
      const p: Plugin = {
        id: text('id'),
        name: text('name'),
        version: text('version'),
        author: text('author').slice(0, 60),
        description: text('description').slice(0, 200),
        kind,
        actions,
        on: true,
        problem: null,
      }
      this.list = [...this.list.filter((x) => x.id !== p.id), p].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      )
      return clone(p)
    }
    if (kind === 'logic') {
      // The PC loads the module in its sandbox; the demo checks it's WebAssembly at all.
      const magic = [0, 0x61, 0x73, 0x6d]
      if (!magic.every((b, i) => main[i] === b))
        throw refused(
          422,
          'plugin_module_broken',
          'The plugin’s module doesn’t work: its module isn’t WebAssembly.',
          'Ask its maker for a version that does.',
        )
      return done()
    }
    if (kind === 'panel') {
      this.pages.set(text('id'), { html: strFromU8(main), actions })
      return done()
    }
    const effect = main
    const code = strFromU8(effect).replace(/\/\/.*$/gm, '')
    const broken = (why: string) =>
      refused(
        422,
        'plugin_effect_broken',
        `The plugin’s effect doesn’t work: ${why}.`,
        'Ask its maker for a version that does.',
      )
    if (/\b(loop|while)\b/.test(code))
      throw broken('it uses loop or while; plugin effects use only for loops with a fixed count')
    if (!/\bfn\s+effect\s*\(/.test(code)) throw broken('it has no effect function')
    return done()
  }

  /** The catalog, each plugin marked installed (its version here) and update. */
  private catalog() {
    return {
      plugins: CATALOG.map((c) => {
        const here = this.list.find((p) => p.id === c.id)
        return {
          ...clone(c),
          size: 2048,
          installed: here?.version ?? null,
          update: here ? newer(c.version, here.version) : false,
        }
      }),
    }
  }

  private installFromCatalog(body: unknown): Plugin {
    const id = String(requireObj(body).id ?? '')
    const c = CATALOG.find((x) => x.id === id)
    if (!c)
      throw refused(
        404,
        'catalog_no_plugin',
        `The catalog has no plugin called ${id}.`,
        'Look again.',
      )
    const p: Plugin = { ...clone(c), on: true, problem: null }
    this.list = [...this.list.filter((x) => x.id !== id), p]
    if (c.kind === 'panel') this.pages.set(id, { html: PANEL_HTML, actions: c.actions })
    return clone(p)
  }

  route(method: string, seg: string[], body: unknown): Routed | Promise<Routed> {
    if (seg[0] !== 'plugins') return NOT_MINE
    if (seg[1] === 'catalog') {
      if (seg.length === 2 && method === 'GET') return this.catalog()
      if (seg.length === 3 && seg[2] === 'install' && method === 'POST')
        return this.installFromCatalog(body)
      return NOT_MINE
    }
    if (seg.length === 1 && method === 'GET') return clone(this.list)
    if (seg.length === 1 && method === 'POST') return this.install(body)
    if (seg.length === 2 && method === 'PUT') {
      const b = requireObj(body)
      if (typeof b.on !== 'boolean') throw new HttpError(400, 'invalid', 'on: true or false.')
      const p = this.find(seg[1] ?? '')
      p.on = b.on
      return clone(p)
    }
    if (seg.length === 3 && seg[2] === 'panel' && method === 'GET') {
      const p = this.find(seg[1] ?? '')
      const page = this.pages.get(p.id)
      if (p.kind !== 'panel' || !page) return this.find('')
      if (!p.on) throw new HttpError(422, 'unavailable', `${p.name} is off: turn it on first.`)
      return clone(page)
    }
    if (seg.length === 3 && seg[2] === 'act' && method === 'POST') {
      const p = this.find(seg[1] ?? '')
      if (p.kind !== 'panel') return this.find('')
      if (!p.on) throw new HttpError(422, 'unavailable', `${p.name} is off: turn it on first.`)
      const type = String(requireObj(body).type ?? '')
      if (!p.actions.includes(type))
        throw new HttpError(
          403,
          'plugin_not_allowed',
          `${p.name} isn’t allowed to do "${type}".`,
          'Its plugin.json lists what it may do; ask its maker.',
        )
      return null
    }
    if (seg.length === 2 && method === 'DELETE') {
      this.find(seg[1] ?? '')
      this.list = this.list.filter((x) => x.id !== seg[1])
      this.pages.delete(seg[1] ?? '')
      return null
    }
    return NOT_MINE
  }
}

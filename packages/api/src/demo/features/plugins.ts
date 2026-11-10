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
const ALLOWED = ['json', 'wgsl', 'md', 'txt', 'png']
const ID = /^[a-z][a-z0-9._-]{2,63}$/

/** The plugin the demo starts with. */
const SAMPLE: Plugin = {
  id: 'com.ferrocast.sample.scanlines',
  name: 'Scanlines',
  version: '1.0.0',
  author: 'Ferrocast',
  description: 'Thin lines across the picture, like an old monitor.',
  kind: 'effect',
  on: true,
  problem: null,
}

function refused(status: number, code: string, message: string, hint: string): HttpError {
  return new HttpError(status, code, message, hint)
}

export class DemoPlugins {
  private list: Plugin[] = [clone(SAMPLE)]

  /** The effects of the plugins that are on (the Effect list shows them). */
  effects(): { id: string; name: string }[] {
    return this.list.filter((p) => p.on && !p.problem).map((p) => ({ id: p.id, name: p.name }))
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
          `The plugin holds "${name}"; plugins hold only .json, .wgsl, .md, .txt and .png files.`,
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
    if (text('kind') !== 'effect')
      throw wrong(`it’s a "${text('kind')}" plugin; this Ferrocast takes effect plugins`)
    const effect = files.get(text('effect'))
    if (!text('effect').endsWith('.wgsl') || !effect)
      throw notOne(`its effect "${text('effect')}" isn’t in it`)
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
    const p: Plugin = {
      id: text('id'),
      name: text('name'),
      version: text('version'),
      author: text('author').slice(0, 60),
      description: text('description').slice(0, 200),
      kind: 'effect',
      on: true,
      problem: null,
    }
    this.list = [...this.list.filter((x) => x.id !== p.id), p].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    )
    return clone(p)
  }

  route(method: string, seg: string[], body: unknown): Routed | Promise<Routed> {
    if (seg[0] !== 'plugins') return NOT_MINE
    if (seg.length === 1 && method === 'GET') return clone(this.list)
    if (seg.length === 1 && method === 'POST') return this.install(body)
    if (seg.length === 2 && method === 'PUT') {
      const b = requireObj(body)
      if (typeof b.on !== 'boolean') throw new HttpError(400, 'invalid', 'on: true or false.')
      const p = this.find(seg[1] ?? '')
      p.on = b.on
      return clone(p)
    }
    if (seg.length === 2 && method === 'DELETE') {
      this.find(seg[1] ?? '')
      this.list = this.list.filter((x) => x.id !== seg[1])
      return null
    }
    return NOT_MINE
  }
}

// Designs in the demo engine, matching the engine (`crates/engine/src/designs.rs`,
// `crates/store/src/designfile.rs`, API.md §4 Designs): the built-in catalogue, your own
// designs, Use, Duplicate, the alert design in use, and `.ferrodesign` files with the same
// checks and error codes.

import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate'
import {
  BUILTIN_PREFIX,
  allowsTts,
  designMediaIds,
  intoUser,
  isBrandLayer,
  pickLook,
  remapMedia,
  renderOnto,
  validateDesign,
  validateLayout,
} from '../../design'
import type {
  Design,
  DesignImportReport,
  DesignKind,
  DesignRef,
  FerroEvent,
  Media,
  Overlay,
  RenderedAlert,
  Scene,
  UseDesignResult,
  Widget,
} from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type Routed } from './host'

/** What the designs feature borrows from the demo engine. */
export interface DesignHost {
  overlays(): Overlay[]
  findOverlay(id: string): Overlay
  /** Saves an overlay as is and pushes the new layout to its open pages. */
  putOverlay(o: Overlay): Overlay
  /** A new overlay (fresh id and URL) from a scene. */
  newOverlay(name: string, scene: Scene, design: DesignRef, layers: Widget[]): Overlay
  media(id: string): { media: Media; blob: Blob | null } | null
  /** Adds a file to the media library (same checks as an upload). */
  addMedia(name: string, blob: Blob, kind: Media['kind']): Media
  /** Media ids alert rules use (so the library can say where a file is used). */
  now(): number
  newId(): string
}

const KINDS: readonly DesignKind[] = ['alert', 'theme', 'scene', 'widget']
const MAX_FILE = 100 * 1024 * 1024
const MAX_JSON = 2 * 1024 * 1024
const MEDIA_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', 'ogg', 'wav', 'webm', 'mp4']
const RISKY_EXTS = [
  'js',
  'mjs',
  'cjs',
  'html',
  'htm',
  'xhtml',
  'svg',
  'svgz',
  'php',
  'exe',
  'bat',
  'cmd',
  'sh',
  'ps1',
  'wasm',
  'jar',
]
const LIMITS: Record<Media['kind'], { bytes: number; label: string }> = {
  image: { bytes: 10 * 1024 * 1024, label: 'Images can be up to 10 MB.' },
  sound: { bytes: 5 * 1024 * 1024, label: 'Sounds can be up to 5 MB.' },
  video: { bytes: 50 * 1024 * 1024, label: 'Videos can be up to 50 MB.' },
}

/** core::store::repo::media::sniff: the real type from the first bytes (never SVG). */
export function sniff(b: Uint8Array): { kind: Media['kind']; mime: string; ext: string } | null {
  const at = (off: number, sig: number[]) => sig.every((v, i) => b[off + i] === v)
  const ascii = (off: number, s: string) =>
    at(
      off,
      Array.from(s, (c) => c.charCodeAt(0)),
    )
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { kind: 'image', mime: 'image/png', ext: 'png' }
  if (at(0, [0xff, 0xd8, 0xff])) return { kind: 'image', mime: 'image/jpeg', ext: 'jpg' }
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a'))
    return { kind: 'image', mime: 'image/gif', ext: 'gif' }
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP'))
    return { kind: 'image', mime: 'image/webp', ext: 'webp' }
  if (ascii(0, 'RIFF') && ascii(8, 'WAVE')) return { kind: 'sound', mime: 'audio/wav', ext: 'wav' }
  if (ascii(0, 'OggS')) return { kind: 'sound', mime: 'audio/ogg', ext: 'ogg' }
  if (ascii(0, 'ID3') || (b.length > 1 && b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0))
    return { kind: 'sound', mime: 'audio/mpeg', ext: 'mp3' }
  if (at(0, [0x1a, 0x45, 0xdf, 0xa3])) return { kind: 'video', mime: 'video/webm', ext: 'webm' }
  if (ascii(4, 'ftyp')) return { kind: 'video', mime: 'video/mp4', ext: 'mp4' }
  return null
}

async function sha256(b: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', b as unknown as ArrayBuffer)
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('')
}

const short = (s: string, max: number) => Array.from(s.trim()).slice(0, max).join('').trimEnd()

function builtInRefusal(action: string): HttpError {
  return new HttpError(
    409,
    'built_in',
    `Built-in designs can't be ${action}.`,
    'Use Duplicate & customise to make your own copy, then change that.',
  )
}

const notFound = () =>
  new HttpError(
    404,
    'not_found',
    "That design doesn't exist.",
    'Reload the page; it may have been deleted.',
  )

export class DemoDesigns {
  private mine: Design[] = []
  private active: string | null = null
  private readonly tests = new Map<string, Design>()

  constructor(
    private readonly host: DesignHost,
    private readonly builtins: readonly Design[],
  ) {}

  // ---------------------------------------------------------------- reads

  all(): Design[] {
    return [
      ...this.builtins.map((d) => clone(d)),
      ...[...this.mine].sort((a, b) => b.updated_at - a.updated_at).map((d) => clone(d)),
    ]
  }

  find(id: string): Design {
    const d = this.builtins.find((x) => x.id === id) ?? this.mine.find((x) => x.id === id)
    if (!d) throw notFound()
    return clone(d)
  }

  activeAlert(): string | null {
    return this.active
  }

  activeDesign(): Design | null {
    if (!this.active) return null
    try {
      const d = this.find(this.active)
      return d.kind === 'alert' ? d : null
    } catch {
      return null
    }
  }

  /** Dresses an alert with the design in use (or the one a designer test asked for). */
  dress(alert: RenderedAlert, e: FerroEvent): RenderedAlert {
    const d = this.tests.get(e.id) ?? this.activeDesign()
    this.tests.delete(e.id)
    if (!d) return alert
    const picked = pickLook(d, e)
    if (!picked) return alert
    const out = renderOnto(alert, d, picked.key, picked.variation, e)
    if (!allowsTts(picked.variation.look, e)) out.tts_text = null
    return out
  }

  testWith(eventId: string, designId: string): void {
    const d = this.find(designId)
    if (d.kind !== 'alert')
      throw new HttpError(400, 'invalid', 'design_id: test alerts need an alert design.')
    this.tests.set(eventId, d)
  }

  /** Library files a design uses, by name of the design (media deletes say where). */
  usedBy(mediaId: string): string[] {
    return this.mine.filter((d) => designMediaIds(d).includes(mediaId)).map((d) => d.name)
  }

  /** The mark of a built-in stays on overlays made from it (engine `check_branding`). */
  checkBranding(current: Overlay, edited: Widget[]): void {
    const keep = () =>
      new HttpError(
        409,
        'branding',
        'This overlay uses a built-in design, which keeps its small Ferrocast mark.',
        'Duplicate the design in the gallery to make an unbranded copy, then use that.',
      )
    const visibleMark = (ws: Widget[]) => ws.some((w) => isBrandLayer(w) && !w.hidden)
    if (current.design?.branded && visibleMark(current.widgets) && !visibleMark(edited))
      throw keep()
    for (const w of edited) {
      const id = (w.config as { design_id?: unknown }).design_id
      if (typeof id !== 'string') continue
      const b = this.builtins.find((d) => d.id === id)
      if (b?.branded && (w.config as { branded?: unknown }).branded !== true) throw keep()
    }
  }

  // ---------------------------------------------------------------- routes

  route(method: string, seg: string[], body: unknown, url: URL): Routed {
    if (seg[0] !== 'designs') return NOT_MINE
    const [, b, c] = seg
    const is = (m: string, n: number) => method === m && seg.length === n
    if (is('GET', 1)) {
      const kind = url.searchParams.get('kind')
      if (kind && !KINDS.includes(kind as DesignKind))
        throw new HttpError(
          400,
          'invalid',
          `kind: "${kind}" isn't a design kind; use alert, theme, scene or widget.`,
        )
      return this.all().filter((d) => !kind || d.kind === kind)
    }
    if (is('POST', 1)) return this.create(body)
    if (b === 'active-alert' && is('GET', 2)) return { design_id: this.active }
    if (b === 'active-alert' && is('PUT', 2)) {
      const o = requireObj(body)
      const id = o.design_id
      if (id !== null && typeof id !== 'string')
        throw new HttpError(400, 'invalid', 'design_id: must be a design id or null.')
      return { design_id: this.setActive(id) }
    }
    if (b === 'import' && is('POST', 2)) return this.importFile(body)
    if (!b) return NOT_MINE
    if (is('GET', 2)) return this.find(b)
    if (is('PUT', 2)) return this.update(b, body)
    if (is('DELETE', 2)) {
      this.remove(b)
      return undefined
    }
    if (c === 'duplicate' && is('POST', 3)) {
      const o = body && typeof body === 'object' ? (body as { name?: unknown }) : {}
      return this.duplicate(b, typeof o.name === 'string' ? o.name : null)
    }
    if (c === 'use' && is('POST', 3)) return this.use(b, body)
    if (c === 'export' && is('POST', 3)) return this.exportFile(b)
    return NOT_MINE
  }

  private check(d: Design): void {
    const e = validateDesign(d)
    if (e) throw new HttpError(400, 'invalid', e)
  }

  private create(body: unknown): Design {
    const d = requireObj(body) as unknown as Design
    if (!KINDS.includes(d.kind))
      throw new HttpError(400, 'invalid', 'A field is missing or wrong: kind.')
    const kind = ['duplicate', 'asset_pack', 'scratch'].includes(d.origin?.type)
      ? d.origin.type
      : 'scratch'
    const from = typeof d.origin?.from === 'string' ? short(d.origin.from, 120) : null
    const mine = intoUser(clone(d), this.host.newId(), { type: kind, from }, this.host.now())
    this.check(mine)
    this.mine.push(mine)
    return clone(mine)
  }

  private update(id: string, body: unknown): Design {
    if (id.startsWith(BUILTIN_PREFIX)) throw builtInRefusal('changed')
    const d = requireObj(body) as unknown as Design
    if (d.built_in || d.branded)
      throw new HttpError(
        400,
        'invalid',
        'branded: only built-in designs carry the Ferrocast mark.',
      )
    const i = this.mine.findIndex((x) => x.id === id)
    if (i < 0) throw notFound()
    const cur = this.mine[i] as Design
    if (cur.kind !== d.kind)
      throw new HttpError(
        409,
        'conflict',
        `This design is a${cur.kind === 'alert' ? 'n' : ''} ${cur.kind} design; it can't become a ${d.kind} design.`,
      )
    const saved = {
      ...clone(d),
      id,
      pro: false,
      created_at: cur.created_at,
      origin: cur.origin,
      updated_at: Math.max(this.host.now(), cur.updated_at + 1),
      name: d.name.trim(),
    } as Design
    this.check(saved)
    this.mine[i] = saved
    return clone(saved)
  }

  private remove(id: string): void {
    if (id.startsWith(BUILTIN_PREFIX)) throw builtInRefusal('deleted')
    if (this.active === id)
      throw new HttpError(
        409,
        'in_use',
        'Your alerts play with this design.',
        'Pick another alert design in the gallery first, then delete this one.',
      )
    const before = this.mine.length
    this.mine = this.mine.filter((d) => d.id !== id)
    if (this.mine.length === before) throw notFound()
  }

  duplicate(id: string, name: string | null): Design {
    const src = this.find(id)
    const copy = clone(src)
    copy.name = (name && short(name, 60)) || short(`${src.name} copy`, 60)
    if (copy.kind === 'theme' && copy.content.alert_design?.startsWith(BUILTIN_PREFIX)) {
      const a = this.builtins.find((x) => x.id === copy.content.alert_design)
      copy.content.alert_design = a ? this.duplicate(a.id, null).id : null
    }
    const mine = intoUser(
      copy,
      this.host.newId(),
      { type: 'duplicate', from: short(src.name, 120) },
      this.host.now(),
    )
    this.check(mine)
    this.mine.push(mine)
    return clone(mine)
  }

  private setActive(id: string | null): string | null {
    if (id !== null) {
      const d = this.find(id)
      if (d.kind !== 'alert')
        throw new HttpError(
          400,
          'invalid',
          `design_id: "${short(d.name, 40)}" is a ${d.kind} design; pick an alert design.`,
        )
    }
    this.active = id
    return id
  }

  private use(id: string, body: unknown): UseDesignResult {
    const d = this.find(id)
    const req = (body && typeof body === 'object' ? body : {}) as {
      overlay_id?: unknown
      scenes?: unknown
      alert_style?: unknown
    }
    if (
      req.scenes !== undefined &&
      !(Array.isArray(req.scenes) && req.scenes.every((s) => typeof s === 'string'))
    )
      throw new HttpError(400, 'invalid', 'A field is missing or wrong: scenes.')
    const overlayId = typeof req.overlay_id === 'string' ? req.overlay_id : null
    const scenes = (req.scenes as string[] | undefined) ?? []
    const overlays: Overlay[] = []
    if (d.kind === 'alert') return { alert_design: this.setActive(d.id), overlays }
    if (d.kind === 'widget') {
      if (!overlayId)
        throw new HttpError(400, 'invalid', 'overlay_id: pick the overlay to add this widget to.')
      const o = clone(this.host.findOverlay(overlayId))
      if (o.widgets.length >= 40)
        throw new HttpError(
          409,
          'conflict',
          'That overlay already has 40 widgets, the most one can hold. Remove one first.',
        )
      const w = d.content
      const ww = Math.min(w.w, o.width)
      const hh = Math.min(w.h, o.height)
      let n = 1
      while (o.widgets.some((x) => x.id === `${w.widget}-${n}`)) n += 1
      o.widgets.push({
        id: `${w.widget}-${n}`,
        kind: w.widget,
        x: Math.floor((o.width - ww) / 2),
        y: Math.floor((o.height - hh) / 2),
        w: ww,
        h: hh,
        config: { ...clone(w.config), style: clone(w.style), design_id: d.id, branded: d.branded },
      } as Widget)
      overlays.push(this.host.putOverlay(o))
      return { alert_design: this.active, overlays }
    }
    const list: Scene[] =
      d.kind === 'scene'
        ? [d.content]
        : scenes.length
          ? d.content.scenes.filter((s) => scenes.includes(s.key))
          : d.content.scenes
    if (d.kind === 'theme' && scenes.length && list.length !== scenes.length)
      throw new HttpError(400, 'invalid', "scenes: one of those scenes isn't in this theme.")
    if (overlayId && list.length !== 1)
      throw new HttpError(
        400,
        'invalid',
        'overlay_id: pick one scene to put on an existing overlay.',
      )
    for (const s of list) {
      const layers = d.branded ? clone(s.layers) : s.layers.filter((l) => !isBrandLayer(l))
      const link: DesignRef = { id: d.id, scene: s.key, branded: d.branded }
      if (overlayId) {
        const o = clone(this.host.findOverlay(overlayId))
        overlays.push(
          this.host.putOverlay({
            ...o,
            width: s.width,
            height: s.height,
            widgets: layers,
            design: link,
          }),
        )
      } else {
        const name = d.kind === 'theme' ? short(`${s.name} (${d.name})`, 60) : short(d.name, 60)
        overlays.push(this.host.newOverlay(name, s, link, layers))
      }
    }
    let alert = this.active
    if (d.kind === 'theme' && req.alert_style !== false && d.content.alert_design) {
      try {
        if (this.find(d.content.alert_design).kind === 'alert')
          alert = this.setActive(d.content.alert_design)
      } catch {
        /* the theme's alert design is gone: alerts stay as they are */
      }
    }
    return { alert_design: alert, overlays }
  }

  /** Checks a scene's layers the way the engine checks an overlay. */
  static checkLayout(name: string, width: number, height: number, widgets: Widget[]): void {
    const e = validateLayout(name, width, height, widgets)
    if (e) throw new HttpError(400, 'invalid', e.charAt(0).toUpperCase() + e.slice(1) + '.')
  }

  // ---------------------------------------------------------------- .ferrodesign

  private async exportFile(id: string): Promise<Response> {
    if (id.startsWith(BUILTIN_PREFIX)) throw builtInRefusal('exported')
    const d = this.find(id)
    const designs: Design[] = [d]
    if (
      d.kind === 'theme' &&
      d.content.alert_design &&
      !d.content.alert_design.startsWith(BUILTIN_PREFIX)
    ) {
      try {
        designs.push(this.find(d.content.alert_design))
      } catch {
        /* exported without it */
      }
    }
    const files: Record<string, Uint8Array> = {}
    const manifestFiles: Record<string, { sha256: string; bytes: number; mime: string }> = {}
    const remap: Record<string, string> = {}
    for (const x of designs)
      for (const mid of designMediaIds(x)) {
        if (remap[mid]) continue
        const m = this.host.media(mid)
        if (!m?.blob) continue
        const bytes = new Uint8Array(await m.blob.arrayBuffer())
        const t = sniff(bytes)
        if (!t) continue
        const sha = await sha256(bytes)
        const name = `media/${sha}.${t.ext}`
        files[name] = bytes
        manifestFiles[name] = { sha256: sha, bytes: bytes.length, mime: t.mime }
        remap[mid] = sha
      }
    const ids: Record<string, string> = Object.fromEntries(
      designs.map((x, i) => [x.id, `d${i + 1}`]),
    )
    const out = designs.map((x) => {
      const c = remapMedia(x, remap)
      c.id = ids[x.id] ?? x.id
      c.built_in = false
      c.branded = false
      c.pro = false
      if (c.kind === 'theme')
        c.content.alert_design = c.content.alert_design
          ? (ids[c.content.alert_design] ?? null)
          : null
      return c
    })
    const manifest = {
      format: 'ferrodesign',
      version: 1,
      app_version: 'demo',
      created_at: this.host.now(),
      name: d.name,
      kind: d.kind,
      designs: out.length,
      files: manifestFiles,
    }
    files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
    out.forEach((x, i) => (files[`designs/${i + 1}.json`] = strToU8(JSON.stringify(x, null, 2))))
    const zip = zipSync(files)
    const stem = d.name.replace(/[^A-Za-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'design'
    return new Response(zip as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${stem}.ferrodesign"`,
      },
    })
  }

  private async importFile(body: unknown): Promise<DesignImportReport> {
    if (!(body instanceof FormData))
      throw new HttpError(
        415,
        'wrong_content_type',
        'Send the design file as multipart/form-data in a field named "file".',
      )
    const file = body.get('file')
    if (!(file instanceof Blob))
      throw new HttpError(400, 'invalid', 'Attach the .ferrodesign in a form field named "file".')
    if (file.size === 0)
      throw new HttpError(
        400,
        'invalid',
        'The file is empty.',
        'Pick a .ferrodesign exported from Ferrocast.',
      )
    if (file.size > MAX_FILE)
      throw new HttpError(
        413,
        'too_large',
        'Design files can be up to 100 MB.',
        'Remove large videos from the design, then export it again.',
      )
    let entries: Record<string, Uint8Array>
    try {
      entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
    } catch {
      throw new HttpError(
        415,
        'bad_design_file',
        "That file isn't a .ferrodesign.",
        'Pick a .ferrodesign file exported from Ferrocast.',
      )
    }
    return importEntries(entries, {
      newId: () => this.host.newId(),
      now: () => this.host.now(),
      addMedia: (name, blob, kind) => this.host.addMedia(name, blob, kind),
      save: (d) => {
        this.mine.push(d)
      },
    })
  }
}

const unsafe = (name: string) =>
  new HttpError(
    415,
    'unsafe_design_file',
    `The design file has a file Ferrocast never imports: "${Array.from(name).slice(0, 80).join('')}". Design files only carry designs, pictures, sounds and videos.`,
    'Ask whoever shared it to export it again from Ferrocast.',
  )
const invalid = (m: string) =>
  new HttpError(
    422,
    'invalid_design',
    m,
    'Ask whoever shared it to open and save it in Ferrocast, then export again.',
  )

/** core::store::designfile::import, on unzipped entries. Exported for tests. */
export async function importEntries(
  entries: Record<string, Uint8Array>,
  io: {
    newId(): string
    now(): number
    addMedia(name: string, blob: Blob, kind: Media['kind']): Media
    save(d: Design): void
  },
): Promise<DesignImportReport> {
  const names = Object.keys(entries)
  if (names.length > 300)
    throw new HttpError(413, 'too_large', 'The design file has more than 300 files.')
  const designNames: string[] = []
  const media: { name: string; sha: string }[] = []
  for (const name of names) {
    if (
      name.endsWith('/') ||
      ['preview.png', 'preview.webp', 'preview.jpg', 'manifest.json'].includes(name)
    )
      continue
    const ext = name.toLowerCase().split('.').pop() ?? ''
    if (RISKY_EXTS.includes(ext)) throw unsafe(name)
    if (/^designs\/[A-Za-z0-9]{1,8}\.json$/.test(name)) designNames.push(name)
    else {
      const m = /^media\/([0-9a-f]{64})\.([a-z0-9]+)$/.exec(name)
      if (m && MEDIA_EXTS.includes(m[2] ?? '')) media.push({ name, sha: m[1] ?? '' })
      else throw unsafe(name)
    }
  }
  const mf = entries['manifest.json']
  if (!mf)
    throw new HttpError(
      415,
      'bad_design_file',
      "That file isn't a .ferrodesign.",
      'Pick a .ferrodesign file exported from Ferrocast.',
    )
  if (mf.length > MAX_JSON)
    throw new HttpError(413, 'too_large', '"manifest.json" in the design file is over 2 MB.')
  let manifest: {
    format?: unknown
    version?: unknown
    name?: unknown
    files?: Record<string, { sha256?: string }>
  }
  try {
    manifest = JSON.parse(strFromU8(mf))
  } catch {
    throw new HttpError(
      415,
      'bad_design_file',
      "That file isn't a .ferrodesign.",
      'Pick a .ferrodesign file exported from Ferrocast.',
    )
  }
  if (manifest.format !== 'ferrodesign')
    throw new HttpError(
      415,
      'bad_design_file',
      "That file isn't a .ferrodesign.",
      'Pick a .ferrodesign file exported from Ferrocast.',
    )
  if (typeof manifest.version === 'number' && manifest.version > 1)
    throw new HttpError(
      422,
      'design_too_new',
      `This design file was made by a newer Ferrocast (format ${manifest.version}). Update Ferrocast, then import it.`,
      'Update Ferrocast, then import it again.',
    )
  if (designNames.length === 0) throw invalid('The design file has no designs in it.')
  if (designNames.length > 10)
    throw new HttpError(413, 'too_large', 'A design file can hold up to 10 designs.')
  designNames.sort()
  const designs: Design[] = []
  for (const name of designNames) {
    const raw = entries[name] as Uint8Array
    if (raw.length > MAX_JSON)
      throw new HttpError(413, 'too_large', `"${name}" in the design file is over 2 MB.`)
    let d: Design
    try {
      d = JSON.parse(strFromU8(raw)) as Design
    } catch (e) {
      throw invalid(`${name} can't be read: ${e instanceof Error ? e.message : String(e)}.`)
    }
    if (
      typeof d !== 'object' ||
      d === null ||
      !KINDS.includes(d.kind) ||
      typeof d.content !== 'object'
    )
      throw invalid(`${name} can't be read: a field is missing or wrong.`)
    if (typeof d.schema === 'number' && d.schema > 1)
      throw new HttpError(
        422,
        'design_too_new',
        `This design file was made by a newer Ferrocast (format ${d.schema}). Update Ferrocast, then import it.`,
        'Update Ferrocast, then import it again.',
      )
    const check = { ...d, built_in: false, branded: false }
    let e: string | null
    try {
      e = validateDesign(check)
    } catch {
      e = 'a field is missing or wrong.'
    }
    if (e) throw invalid(`${name}: ${e}`)
    if (designs.some((x) => x.id === check.id))
      throw invalid(
        `${name}: two designs in the file share the id "${String(check.id).slice(0, 40)}". Export it again from Ferrocast.`,
      )
    designs.push(check)
  }
  const present = new Set(media.map((m) => m.sha))
  for (const [i, d] of designs.entries()) {
    const missing = designMediaIds(d).find((m) => !present.has(m))
    if (missing)
      throw invalid(
        `${designNames[i]} uses a file that isn't in the design file (${missing.slice(0, 16)}…). Export it again from Ferrocast.`,
      )
  }
  const checked: { sha: string; bytes: Uint8Array; kind: Media['kind']; mime: string }[] = []
  for (const m of media) {
    const bytes = entries[m.name] as Uint8Array
    if (bytes.length > LIMITS.video.bytes)
      throw new HttpError(413, 'too_large', `"${m.name}" is over 50 MB, the most for one file.`)
    if ((await sha256(bytes)) !== m.sha)
      throw new HttpError(
        415,
        'damaged_design_file',
        `The design file is damaged: "${m.name}" doesn't match its checksum.`,
        'The file may not have finished downloading. Get it again.',
      )
    const listed = manifest.files?.[m.name]?.sha256
    if (listed !== undefined && listed !== m.sha)
      throw new HttpError(
        415,
        'damaged_design_file',
        `The design file is damaged: the manifest's checksum for "${m.name}" is wrong.`,
        'The file may not have finished downloading. Get it again.',
      )
    const t = sniff(bytes)
    if (!t)
      throw new HttpError(
        415,
        'unsupported_type',
        `"${m.name}" isn't a picture, sound or video Ferrocast can play (PNG, JPEG, GIF, WebP, MP3, OGG, WAV, WebM or MP4).`,
        'Replace that file in the design, then export again.',
      )
    if (bytes.length > LIMITS[t.kind].bytes)
      throw new HttpError(
        415,
        'unsupported_type',
        `"${m.name}" is too big. ${LIMITS[t.kind].label}`,
        'Replace that file in the design, then export again.',
      )
    checked.push({ sha: m.sha, bytes, kind: t.kind, mime: t.mime })
  }
  const used = new Set(designs.flatMap(designMediaIds))
  const remap: Record<string, string> = {}
  let mediaFiles = 0
  const label = typeof manifest.name === 'string' ? manifest.name : 'Shared design'
  for (const c of checked) {
    if (!used.has(c.sha)) continue
    const m = io.addMedia(
      `${short(label, 60)} file`,
      new Blob([c.bytes as unknown as BlobPart], { type: c.mime }),
      c.kind,
    )
    remap[c.sha] = m.id
    mediaFiles += 1
  }
  const ids: Record<string, string> = Object.fromEntries(designs.map((d) => [d.id, io.newId()]))
  const notes: string[] = []
  const out = designs.map((d) => {
    let mine = intoUser(
      remapMedia(d, remap),
      ids[d.id] ?? io.newId(),
      { type: 'import', from: short(label, 120) },
      io.now(),
    )
    if (mine.kind === 'theme' && mine.content.alert_design) {
      const a = mine.content.alert_design
      if (ids[a]) mine = { ...mine, content: { ...mine.content, alert_design: ids[a] ?? null } }
      else if (!a.startsWith(BUILTIN_PREFIX)) {
        notes.push(`${mine.name}: its alert design wasn't in the file, so it uses your own.`)
        mine = { ...mine, content: { ...mine.content, alert_design: null } }
      }
    }
    return mine
  })
  for (const d of out) io.save(d)
  if (mediaFiles === 0 && Object.keys(manifest.files ?? {}).length === 0)
    notes.push('No pictures or sounds came with it: it uses the art built into Ferrocast.')
  return { designs: clone(out), media_files: mediaFiles, notes }
}

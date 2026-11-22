// `.overlay` theme-pack importer & Studio scene collections library in the demo engine, matching
// `crates/engine/src/import/{overlay_parse.rs,overlay.rs}` and `crates/engine/src/fonts.rs`.

import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'
import type { Overlay, Widget, WidgetKind } from '../../types'
import type {
  EngineImportReport,
  EngineShelf,
  EngineShelfKind,
  FontStatus,
  OverlayPackFontPreview,
  OverlayPackFontResult,
  OverlayPackFormat,
  OverlayPackImportReport,
  OverlayPackPreview,
  OverlayPackPreviewScene,
  OverlayPackPreviewWidget,
  OverlayPackUndoReport,
  OverlayPackUnknownSource,
} from '../../studio-engine'
import { HttpError } from '../http-error'
import { clone, requireObj } from './host'

const MAX_OVERLAY_ZIP = 150 * 1024 * 1024
const MAX_OVERLAY_FILES = 500
const MAX_OVERLAY_UNPACKED = 300 * 1024 * 1024
/** The most any one file may unpack to (the engine's video cap). */
const MAX_OVERLAY_ENTRY = 60 * 1024 * 1024

const MEDIA_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'mp3',
  'ogg',
  'wav',
  'flac',
  'aac',
  'm4a',
  'webm',
  'mp4',
  'mov',
])
const FONT_EXTS = new Set(['ttf', 'otf', 'woff', 'woff2'])

export interface DemoOverlayHost {
  baseUrl(): string
  isLive(): boolean
  isOffline(): boolean
  createOverlay(input: { name: string; width: number; height: number; widgets: Widget[] }): Overlay
  deleteOverlay(id: string): void
  now(): number
}

interface StoredCollection {
  id: string
  name: string
  doc: Record<string, unknown>
}

interface ParsedDemoPack {
  suggestedName: string
  format: OverlayPackFormat
  canvas: { width: number; height: number }
  scenes: OverlayPackPreviewScene[]
  widgets: OverlayPackPreviewWidget[]
  plannedOverlays: { scene: string; widgets: Widget[] }[]
  unknownSources: OverlayPackUnknownSource[]
  missingAssets: string[]
  mediaFiles: number
  mediaBytes: number
  fonts: { family: string; style: string; bundled: boolean }[]
  notes: string[]
  sourceCount: number
  webPages: number
  missingKinds: string[]
  doc: Record<string, unknown>
}

interface StagedDemoPreview {
  id: string
  parsed: ParsedDemoPack
  expiresAt: number
}

interface UndoEntry {
  token: string
  collectionId: string
  collectionName: string
  previousId: string
  overlayIds: string[]
  mediaFiles: number
}

function sanitizeArchivePath(raw: string): string {
  if (
    !raw ||
    raw.includes('\\') ||
    raw.startsWith('/') ||
    [...raw].some((ch) => {
      const c = ch.codePointAt(0) ?? 32
      return c < 32 || (c >= 0x7f && c <= 0x9f)
    })
  ) {
    throw new HttpError(
      415,
      'unsafe_overlay_file',
      `The theme pack contains an unsafe path "${raw}".`,
      'Ask whoever made the pack to export it again.',
    )
  }
  if (/^[a-zA-Z]:/.test(raw)) {
    throw new HttpError(
      415,
      'unsafe_overlay_file',
      `The theme pack contains an unsafe path "${raw}".`,
      'Ask whoever made the pack to export it again.',
    )
  }
  const parts = raw.replace(/\/+$/, '').split('/')
  // `:` is a drive or an alternate data stream; Windows drops a trailing dot or space and keeps
  // device names (CON, NUL, COM1..9 and LPT1..9, also with superscript digits) for the device.
  const device = (seg: string) => {
    const stem = (seg.split('.')[0] ?? '').toUpperCase()
    return (
      ['CON', 'PRN', 'AUX', 'NUL'].includes(stem) || /^(COM|LPT)[1-9\u00b9\u00b2\u00b3]$/.test(stem)
    )
  }
  if (
    raw.includes(':') ||
    parts.some(
      (s) => !s || s === '.' || s === '..' || /[. ]$/.test(s) || s.startsWith(' ') || device(s),
    )
  ) {
    throw new HttpError(
      415,
      'unsafe_overlay_file',
      `The theme pack contains an unsafe path "${raw}".`,
      'Ask whoever made the pack to export it again.',
    )
  }
  return parts.join('/')
}

function isOsMetadata(clean: string): boolean {
  if (clean === '__MACOSX' || clean.startsWith('__MACOSX/')) return true
  const base = clean.split('/').pop() ?? clean
  return base === '.DS_Store' || base.toLowerCase() === 'thumbs.db' || base.startsWith('._')
}

function sniffExtMatches(ext: string, bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false
  if (ext === 'png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    )
  }
  if (ext === 'jpg' || ext === 'jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (ext === 'gif') {
    return bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46
  }
  if (ext === 'webp') {
    return bytes.length >= 12 && bytes[0] === 0x52 && bytes[8] === 0x57 && bytes[9] === 0x45
  }
  if (ext === 'webm') {
    return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf
  }
  if (ext === 'mp4' || ext === 'mov' || ext === 'm4a') {
    return (
      bytes.length >= 8 &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
    )
  }
  if (FONT_EXTS.has(ext)) {
    if (bytes.length < 4) return false
    const tag = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!)
    return (
      tag === 'OTTO' ||
      tag === 'ttcf' ||
      tag === 'true' ||
      tag === 'wOFF' ||
      tag === 'wOF2' ||
      (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)
    )
  }
  return true
}

function cleanFontFamily(rawFace?: string | null, rawCustom?: string | null): string | null {
  const fromCustom = rawCustom
    ?.split(/[\\/]/)
    .pop()
    ?.replace(/\.(ttf|otf|woff2?)$/i, '')
    .replace(/[- ](Regular|Bold|Italic|SemiBold|ExtraBold|Medium|Light|Black|Thin)$/i, '')
    .trim()
  const chosen = (rawFace?.trim() || fromCustom || '').trim()
  if (
    !chosen ||
    chosen.length > 60 ||
    !/^[a-zA-Z0-9 -]+$/.test(chosen) ||
    ['sans-serif', 'serif', 'monospace', 'system', 'default', 'none'].includes(chosen.toLowerCase())
  ) {
    return null
  }
  return chosen
}

/** The kinds a Streamlabs or OWN3D pack can map to (not Ferrocast's own credits, emote wall, highlight or a layer). */
type LiveOverlayKind = Exclude<
  WidgetKind,
  'layer' | 'end_credits' | 'emote_wall' | 'chat_highlight'
>

function mapWidgetKind(raw: unknown): { kind: LiveOverlayKind; label: string } | null {
  if (typeof raw === 'number') {
    if (raw === 0) return { kind: 'alerts', label: 'Alerts' }
    if (raw === 6) return { kind: 'chat', label: 'Chat box' }
    if (raw === 7) return { kind: 'events', label: 'Event list' }
    if ([1, 2, 3, 4, 15, 16, 17, 18, 22].includes(raw)) return { kind: 'goal', label: 'Goal bar' }
    if (raw === 9) return { kind: 'viewers', label: 'Viewer count' }
    if (raw === 12) return { kind: 'giveaway', label: 'Spin wheel / Giveaway' }
    if (raw === 19) return { kind: 'poll', label: 'Poll' }
    return null
  }
  const s = String(raw ?? '')
    .toLowerCase()
    .replace(/[-_ ]/g, '')
  if (s === 'alertbox' || s === 'alerts' || s === 'alert')
    return { kind: 'alerts', label: 'Alerts' }
  if (s === 'chatbox' || s === 'chat') return { kind: 'chat', label: 'Chat box' }
  if (s === 'eventlist' || s === 'events') return { kind: 'events', label: 'Event list' }
  if (s.includes('goal')) return { kind: 'goal', label: 'Goal bar' }
  if (s === 'viewercount' || s === 'viewers') return { kind: 'viewers', label: 'Viewer count' }
  if (s === 'poll') return { kind: 'poll', label: 'Poll' }
  if (s === 'spinwheel' || s === 'wheel' || s === 'giveaway')
    return { kind: 'giveaway', label: 'Spin wheel / Giveaway' }
  return null
}

function defaultWidget(id: string, kind: LiveOverlayKind, x: number, y: number): Widget {
  const w = kind === 'alerts' ? 800 : kind === 'chat' ? 480 : kind === 'goal' ? 600 : 420
  const h = kind === 'alerts' ? 420 : kind === 'chat' ? 560 : kind === 'goal' ? 96 : 80
  const pos = {
    id,
    x: Math.max(0, Math.min(1920 - w, Math.round(x))),
    y: Math.max(0, Math.min(1080 - h, Math.round(y))),
    w,
    h,
  }
  switch (kind) {
    case 'alerts':
      return { ...pos, kind: 'alerts', config: { theme: 'molten', rule_ids: null } }
    case 'chat':
      return {
        ...pos,
        kind: 'chat',
        config: {
          platforms: ['twitch', 'youtube', 'kick'],
          max_messages: 30,
          fade_after_s: null,
          show_badges: true,
          show_platform: true,
          hide_commands: true,
          hide_bots: true,
          font_size: 22,
          theme: 'molten',
        },
      }
    case 'events':
      return {
        ...pos,
        kind: 'events',
        config: {
          kinds: ['follow', 'subscription', 'gift_batch', 'tip', 'raid'],
          max_items: 6,
          theme: 'molten',
        },
      }
    case 'goal':
      return { ...pos, kind: 'goal', config: { goal_id: 'g-subs', theme: 'molten' } }
    case 'label':
      return {
        ...pos,
        kind: 'label',
        config: {
          source: 'latest_follower',
          template: 'Latest follower: {name}',
          theme: 'molten',
        },
      }
    case 'viewers':
      return {
        ...pos,
        kind: 'viewers',
        config: { platforms: ['twitch', 'youtube', 'kick'], theme: 'molten' },
      }
    case 'poll':
      return { ...pos, kind: 'poll', config: { theme: 'molten' } }
    case 'giveaway':
      return { ...pos, kind: 'giveaway', config: { theme: 'molten' } }
  }
}

function slugId(name: string, existing: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'set'
  if (!existing.has(base) && !['current', 'import', 'overlay'].includes(base)) return base
  for (let i = 2; ; i++) {
    const c = `${base}-${i}`
    if (!existing.has(c)) return c
  }
}

export class DemoStudioLibrary {
  collections: StoredCollection[] = [
    {
      id: 'default',
      name: 'Main Show',
      doc: { name: 'Main Show', current_scene: 'Main', sources: [] },
    },
    {
      id: 'podcast',
      name: 'Podcast',
      doc: { name: 'Podcast', current_scene: 'Host Cam', sources: [] },
    },
  ]
  currentCollection = 'default'
  profiles = [{ id: 'default', name: 'Default' }]
  currentProfile = 'default'

  private previews: StagedDemoPreview[] = []
  private undos = new Map<string, UndoEntry>()
  private fontCache = new Set<string>()
  private seq = 0
  /** Toggle in tests to simulate offline Google Fonts downloads while localhost engine is reachable. */
  fontsOffline = false
  /** Toggle in tests to simulate an active Studio stream/recording blocking collection switches (409 studio_busy). */
  busy = false

  constructor(private readonly host: DemoOverlayHost) {}

  shelf(kind: EngineShelfKind): EngineShelf {
    if (kind === 'profiles') {
      return { current: this.currentProfile, list: clone(this.profiles) }
    }
    return {
      current: this.currentCollection,
      list: this.collections.map((c) => ({ id: c.id, name: c.name })),
    }
  }

  newEntry(kind: EngineShelfKind, name: string, _copy = false): { id: string } {
    const clean = name.trim()
    if (!clean || clean.length > 100) {
      throw new HttpError(400, 'invalid', 'name: 1 to 100 characters.')
    }
    if (kind === 'profiles') {
      if (this.profiles.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
        throw new HttpError(
          409,
          'studio_name_taken',
          `There's already a profile called "${clean}".`,
        )
      }
      const id = slugId(clean, new Set(this.profiles.map((p) => p.id)))
      this.profiles.push({ id, name: clean })
      this.currentProfile = id
      return { id }
    }
    if (this.collections.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
      throw new HttpError(
        409,
        'studio_name_taken',
        `There's already a scene collection called "${clean}".`,
      )
    }
    const id = slugId(clean, new Set(this.collections.map((c) => c.id)))
    this.collections.push({
      id,
      name: clean,
      doc: { name: clean, current_scene: 'Main', sources: [] },
    })
    this.currentCollection = id
    return { id }
  }

  switchEntry(kind: EngineShelfKind, id: string): { id: string } {
    if (this.host.isLive()) {
      throw new HttpError(
        409,
        'studio_busy',
        `Stop streaming and recording before changing ${kind === 'profiles' ? 'profiles' : 'scene collections'}.`,
        'Stop every active output first.',
      )
    }
    if (kind === 'profiles') {
      if (!this.profiles.some((p) => p.id === id)) {
        throw new HttpError(404, 'studio_no_such', `There's no profile with the id "${id}".`)
      }
      this.currentProfile = id
      return { id }
    }
    if (!this.collections.some((c) => c.id === id)) {
      throw new HttpError(404, 'studio_no_such', `There's no scene collection with the id "${id}".`)
    }
    this.currentCollection = id
    return { id }
  }

  renameEntry(kind: EngineShelfKind, id: string, name: string): undefined {
    const clean = name.trim()
    if (!clean || clean.length > 100) {
      throw new HttpError(400, 'invalid', 'name: 1 to 100 characters.')
    }
    const list = kind === 'profiles' ? this.profiles : this.collections
    const entry = list.find((e) => e.id === id)
    if (!entry) {
      throw new HttpError(404, 'studio_no_such', 'No such item.')
    }
    if (list.some((e) => e.id !== id && e.name.toLowerCase() === clean.toLowerCase())) {
      throw new HttpError(409, 'studio_name_taken', `"${clean}" is already used.`)
    }
    entry.name = clean
    return undefined
  }

  removeEntry(kind: EngineShelfKind, id: string): undefined {
    const cur = kind === 'profiles' ? this.currentProfile : this.currentCollection
    if (cur === id) {
      throw new HttpError(409, 'studio_in_use', 'That one is in use now.')
    }
    if (kind === 'profiles') {
      if (this.profiles.length <= 1)
        throw new HttpError(409, 'studio_in_use', 'Need at least one profile.')
      this.profiles = this.profiles.filter((p) => p.id !== id)
    } else {
      if (this.collections.length <= 1)
        throw new HttpError(409, 'studio_in_use', 'Need at least one scene collection.')
      this.collections = this.collections.filter((c) => c.id !== id)
    }
    return undefined
  }

  exportEntry(kind: EngineShelfKind, id: string): unknown {
    if (kind === 'profiles') {
      if (!this.profiles.some((p) => p.id === id))
        throw new HttpError(404, 'studio_no_such', 'Not found.')
      return { video_kbps: 6000 }
    }
    const col = this.collections.find((c) => c.id === id)
    if (!col) throw new HttpError(404, 'studio_no_such', 'Not found.')
    return clone(col.doc)
  }

  importObsDoc(name: string, doc: Record<string, unknown>): EngineImportReport {
    const clean = name.trim()
    if (!clean || !Array.isArray(doc.sources)) {
      throw new HttpError(400, 'invalid', 'doc: a scene collection file with a sources list.')
    }
    const id = slugId(clean, new Set(this.collections.map((c) => c.id)))
    this.collections.push({ id, name: clean, doc: clone(doc) })
    this.currentCollection = id
    return {
      name: clean,
      scenes: 1,
      sources: doc.sources.length,
      web_pages: 0,
      missing: [],
    }
  }

  async previewOverlayPack(body: unknown): Promise<OverlayPackPreview> {
    if (!(body instanceof FormData)) {
      throw new HttpError(400, 'invalid', 'Attach the .overlay file in a form field named "file".')
    }
    const file = body.get('file')
    if (!(file instanceof Blob)) {
      throw new HttpError(400, 'invalid', 'Attach the .overlay file in a form field named "file".')
    }
    if (file.size === 0) {
      throw new HttpError(415, 'bad_overlay_file', 'The file is empty.', 'Pick a .overlay file.')
    }
    if (file.size > MAX_OVERLAY_ZIP) {
      throw new HttpError(
        413,
        'too_large',
        'That theme pack is bigger than 150 MB.',
        'Remove large video files from the .overlay archive and try again.',
      )
    }
    const filename = file instanceof File ? file.name : 'pack.overlay'
    const bytes = new Uint8Array(await file.arrayBuffer())
    const parsed = this.parseOverlayBytes(bytes, filename)

    const id = `ovprev_${++this.seq}_${this.host.now().toString(36)}`
    const expiresAt = this.host.now() + 30 * 60_000
    this.previews = this.previews.filter((p) => p.expiresAt > this.host.now()).slice(-3)
    this.previews.push({ id, parsed, expiresAt })

    const installedSet = new Set(['arial', 'helvetica', 'inter'])
    const fonts: OverlayPackFontPreview[] = parsed.fonts.map((f) => {
      const key = f.family.toLowerCase()
      let status: FontStatus = 'missing'
      if (f.bundled) status = 'bundled'
      else if (installedSet.has(key)) status = 'installed'
      else if (this.fontCache.has(key)) status = 'cached'
      return { family: f.family, style: f.style, status }
    })

    return {
      preview_id: id,
      suggested_name: parsed.suggestedName,
      format: parsed.format,
      canvas: parsed.canvas,
      scene_count: parsed.scenes.length,
      source_count: parsed.sourceCount,
      scenes: clone(parsed.scenes),
      widgets: clone(parsed.widgets),
      media_files: parsed.mediaFiles,
      media_bytes: parsed.mediaBytes,
      missing_assets: clone(parsed.missingAssets),
      unknown_sources: clone(parsed.unknownSources),
      fonts,
      notes: clone(parsed.notes),
      expires_at: expiresAt,
    }
  }

  importOverlayPack(body: unknown): OverlayPackImportReport {
    if (this.host.isLive()) {
      throw new HttpError(
        409,
        'studio_busy',
        'Stop streaming and recording before changing scene collections.',
        'Stop every active output first.',
      )
    }
    const o = requireObj(body)
    const previewId = String(o.preview_id ?? '').trim()
    const idx = this.previews.findIndex((p) => p.id === previewId && p.expiresAt > this.host.now())
    if (idx === -1) {
      throw new HttpError(
        404,
        'no_preview',
        'That theme pack preview has expired or already been imported.',
        'Pick the .overlay file again to preview it.',
      )
    }
    const staged = this.previews.splice(idx, 1)[0]!
    const parsed = staged.parsed
    const reqName =
      typeof o.name === 'string' && o.name.trim() ? o.name.trim() : parsed.suggestedName
    if (reqName.length > 100) {
      throw new HttpError(400, 'invalid', 'name: 1 to 100 characters.')
    }
    let uniqueName = reqName
    if (this.collections.some((c) => c.name.toLowerCase() === uniqueName.toLowerCase())) {
      for (let i = 2; ; i++) {
        const cand = `${reqName} (${i})`
        if (!this.collections.some((c) => c.name.toLowerCase() === cand.toLowerCase())) {
          uniqueName = cand
          break
        }
      }
    }

    const createOverlays = o.create_overlays !== false
    const fetchFonts = o.fetch_fonts !== false
    const createdOverlays: Overlay[] = []
    if (createOverlays) {
      for (const pl of parsed.plannedOverlays) {
        const ov = this.host.createOverlay({
          name: `${uniqueName} · ${pl.scene}`.slice(0, 60),
          width: parsed.canvas.width,
          height: parsed.canvas.height,
          widgets: pl.widgets,
        })
        createdOverlays.push(ov)
      }
    }

    const previousId = this.currentCollection
    const id = slugId(uniqueName, new Set(this.collections.map((c) => c.id)))
    this.collections.push({ id, name: uniqueName, doc: clone(parsed.doc) })
    this.currentCollection = id

    const offline = this.fontsOffline || this.host.isOffline()
    const installedSet = new Set(['arial', 'helvetica', 'inter'])
    let offlineFontFallback = false
    const fonts: OverlayPackFontResult[] = parsed.fonts.map((f) => {
      const key = f.family.toLowerCase()
      if (f.bundled) {
        this.fontCache.add(key)
        return {
          family: f.family,
          style: f.style,
          status: 'bundled',
          license: 'Bundled with pack',
          file: `${key.replace(/\s+/g, '-')}.ttf`,
          message: "Saved from theme pack to Ferrocast's font folder.",
        }
      }
      if (installedSet.has(key)) {
        return {
          family: f.family,
          style: f.style,
          status: 'installed',
          message: 'Already installed on this computer.',
        }
      }
      if (this.fontCache.has(key)) {
        return {
          family: f.family,
          style: f.style,
          status: 'cached',
          license: 'Open license (Google Fonts)',
          file: `${key.replace(/\s+/g, '-')}.ttf`,
          message: "Using Ferrocast's local font cache.",
        }
      }
      if (!fetchFonts || offline) {
        if (offline) offlineFontFallback = true
        return {
          family: f.family,
          style: f.style,
          status: 'offline_fallback',
          message: offline
            ? `Couldn't reach Google Fonts (you may be offline). Studio will use a fallback system font for "${f.family}".`
            : `Skipped Google Fonts download for "${f.family}"; using a fallback font.`,
        }
      }
      if (key.includes('commercial') || key.includes('proprietary')) {
        return {
          family: f.family,
          style: f.style,
          status: 'not_found',
          message: `"${f.family}" isn't on Google Fonts. Studio will use a fallback system font.`,
        }
      }
      this.fontCache.add(key)
      return {
        family: f.family,
        style: f.style,
        status: 'downloaded',
        license: 'Open license (Google Fonts)',
        file: `${key.replace(/\s+/g, '-')}.ttf`,
        message: "Downloaded from Google Fonts into Ferrocast's font folder.",
      }
    })

    const undoToken = `undo_${++this.seq}_${this.host.now().toString(36)}`
    this.undos.set(undoToken, {
      token: undoToken,
      collectionId: id,
      collectionName: uniqueName,
      previousId,
      overlayIds: createdOverlays.map((ov) => ov.id),
      mediaFiles: parsed.mediaFiles,
    })

    const notes = [...parsed.notes]
    if (offlineFontFallback) {
      notes.push(
        "Some fonts couldn't be downloaded while offline. Fallback system fonts will be used until you import online.",
      )
    }

    return {
      id,
      name: uniqueName,
      format: parsed.format,
      previous_id: previousId,
      undo_token: undoToken,
      scenes: parsed.scenes.length,
      sources: parsed.sourceCount,
      web_pages: parsed.webPages,
      widgets_mapped: parsed.widgets.filter((w) => w.supported).length,
      overlays_created: createdOverlays.map((ov, i) => ({
        id: ov.id,
        name: ov.name,
        scene: parsed.plannedOverlays[i]?.scene ?? parsed.scenes[0]?.name ?? 'Main',
        url: ov.url,
        widget_kinds: ov.widgets.map((w) => w.kind),
      })),
      media_copied: parsed.mediaFiles,
      media_bytes: parsed.mediaBytes,
      missing_assets: parsed.missingAssets,
      unknown_sources: parsed.unknownSources,
      missing: parsed.missingKinds,
      fonts,
      offline_font_fallback: offlineFontFallback,
      notes,
    }
  }

  undoOverlayPack(body: unknown): OverlayPackUndoReport {
    if (this.host.isLive()) {
      throw new HttpError(
        409,
        'studio_busy',
        'Stop streaming and recording before changing scene collections.',
      )
    }
    const o = requireObj(body)
    const token = String(o.undo_token ?? '').trim()
    const rec = this.undos.get(token)
    if (!rec) {
      throw new HttpError(
        404,
        'no_undo',
        'Nothing to undo for that import anymore.',
        'The import may already have been undone.',
      )
    }
    this.undos.delete(token)
    const restored = this.collections.some((c) => c.id === rec.previousId)
      ? rec.previousId
      : (this.collections.find((c) => c.id !== rec.collectionId)?.id ?? null)
    if (restored) this.currentCollection = restored
    this.collections = this.collections.filter((c) => c.id !== rec.collectionId)
    for (const oid of rec.overlayIds) {
      try {
        this.host.deleteOverlay(oid)
      } catch {
        // already deleted manually
      }
    }
    return {
      removed_collection_id: rec.collectionId,
      removed_collection_name: rec.collectionName,
      ...(restored ? { restored_collection_id: restored } : {}),
      removed_overlays: rec.overlayIds.length,
      deleted_files: rec.mediaFiles,
    }
  }

  /**
   * Unpacks a zip as it is read, counting what really comes out: the sizes in a zip's headers
   * can say anything, so they are never trusted to bound memory. Stops at the first file past
   * the per-file or total limit (or the file count), as the engine does.
   */
  private unzipCapped(zipBytes: Uint8Array): Record<string, Uint8Array> {
    const tooLarge = (message: string) =>
      new HttpError(
        413,
        'too_large',
        message,
        'Trim large media files in the theme pack and try again.',
      )
    const out: Record<string, Uint8Array> = {}
    let failure: HttpError | null = null
    let count = 0
    let total = 0
    try {
      const unzipper = new Unzip((file) => {
        if (failure) return
        count += 1
        if (count > MAX_OVERLAY_FILES) {
          failure = tooLarge('This theme pack has more than 500 files inside.')
          return
        }
        if (file.name.endsWith('/')) {
          out[file.name] = new Uint8Array(0)
          return
        }
        const chunks: Uint8Array[] = []
        let size = 0
        file.ondata = (err, chunk, final) => {
          if (failure) return
          if (err) {
            failure = new HttpError(
              415,
              'bad_overlay_file',
              'That .overlay archive is damaged.',
              'Download or export the .overlay file again.',
            )
            return
          }
          size += chunk.length
          total += chunk.length
          if (size > MAX_OVERLAY_ENTRY) {
            failure = tooLarge(
              `"${file.name}" unpacks past the ${MAX_OVERLAY_ENTRY / 1024 / 1024} MB per-file limit.`,
            )
            file.terminate()
            return
          }
          if (total > MAX_OVERLAY_UNPACKED) {
            failure = tooLarge('This theme pack unpacks past the 300 MB size limit.')
            file.terminate()
            return
          }
          chunks.push(chunk)
          if (final) {
            const whole = new Uint8Array(size)
            let at = 0
            for (const c of chunks) {
              whole.set(c, at)
              at += c.length
            }
            out[file.name] = whole
          }
        }
        file.start()
      })
      unzipper.register(UnzipInflate)
      unzipper.register(UnzipPassThrough)
      // Fed in small pieces: deflate can grow a thousandfold, and a whole push is decoded before
      // `ondata` can count it. A piece of 16 KB gives at most a few MB at a time. Stops at the
      // first limit passed (reading on would still spend time and memory on the rest).
      const PIECE = 16 * 1024
      for (let at = 0; at < zipBytes.length && !failure; at += PIECE) {
        unzipper.push(zipBytes.subarray(at, at + PIECE), at + PIECE >= zipBytes.length)
      }
      if (zipBytes.length === 0) unzipper.push(zipBytes, true)
    } catch {
      if (!failure) {
        throw new HttpError(
          415,
          'bad_overlay_file',
          "That doesn't look like a valid .overlay zip archive.",
          'Download or export the .overlay file again.',
        )
      }
    }
    if (failure) throw failure
    // Bytes that aren't a zip give no entries (the streaming reader doesn't complain).
    if (count === 0) {
      throw new HttpError(
        415,
        'bad_overlay_file',
        "That doesn't look like a valid .overlay zip archive.",
        'Download or export the .overlay file again.',
      )
    }
    return out
  }

  private parseOverlayBytes(zipBytes: Uint8Array, filename: string): ParsedDemoPack {
    const entries = this.unzipCapped(zipBytes)

    const jsonFiles: [string, Record<string, unknown>][] = []
    const mediaMap = new Map<string, number>()
    const bundledFontNames = new Set<string>()
    let mediaFiles = 0
    let mediaBytes = 0

    for (const [rawName, data] of Object.entries(entries)) {
      if (rawName.endsWith('/') && data.length === 0) {
        if (rawName !== '/') sanitizeArchivePath(rawName)
        continue
      }
      const clean = sanitizeArchivePath(rawName)
      if (isOsMetadata(clean)) continue
      const ext = clean.split('.').pop()?.toLowerCase() ?? ''
      if (ext === 'json') {
        try {
          const parsed = JSON.parse(new TextDecoder().decode(data)) as unknown
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('not object')
          }
          jsonFiles.push([clean, parsed as Record<string, unknown>])
        } catch {
          throw new HttpError(
            422,
            'invalid_overlay',
            `That pack's scene file "${clean}" couldn't be read (broken JSON).`,
            'Export the .overlay archive again from Streamlabs or OWN3D.',
          )
        }
      } else if (MEDIA_EXTS.has(ext)) {
        if (!sniffExtMatches(ext, data)) {
          throw new HttpError(
            415,
            'unsupported_type',
            `"${clean}" doesn't match its media file type.`,
            'Re-export the pack so every image, audio, or video file matches its extension.',
          )
        }
        mediaFiles += 1
        mediaBytes += data.length
        mediaMap.set(clean.toLowerCase(), data.length)
        const base = (clean.split('/').pop() ?? clean).toLowerCase()
        if (!mediaMap.has(base)) mediaMap.set(base, data.length)
      } else if (FONT_EXTS.has(ext)) {
        if (!sniffExtMatches(ext, data)) {
          throw new HttpError(
            415,
            'unsupported_type',
            `"${clean}" doesn't look like a font file.`,
            'Include a valid .ttf, .otf, .woff, or .woff2 font file.',
          )
        }
        const fam = cleanFontFamily(null, clean)
        if (fam) bundledFontNames.add(fam.toLowerCase())
      } else {
        throw new HttpError(
          415,
          'unsupported_type',
          `This theme pack contains "${clean}", which isn't a supported media, font, or JSON file.`,
          'Remove scripts, web pages, or unknown file types and export again.',
        )
      }
    }

    const primary =
      jsonFiles.find(([p]) => p.toLowerCase() === 'config.json')?.[1] ??
      jsonFiles.find(([, v]) => v.nodeType === 'RootNode' || Array.isArray(v.sources))?.[1] ??
      jsonFiles.find(([, v]) => Array.isArray(v.scenes))?.[1]
    if (!primary) {
      throw new HttpError(
        422,
        'invalid_overlay',
        "This .overlay pack doesn't contain a Streamlabs or OWN3D scene collection JSON.",
        'Pick a scene collection .overlay export rather than a plain asset folder.',
      )
    }

    const manifest = jsonFiles.find(([p]) => /manifest\.json$/i.test(p))?.[1]
    const own3d =
      JSON.stringify(manifest ?? primary)
        .toLowerCase()
        .includes('own3d') || Array.isArray(primary.scenes)
    const format: OverlayPackFormat =
      primary.nodeType === 'RootNode'
        ? own3d
          ? 'own3d'
          : 'streamlabs'
        : own3d
          ? 'own3d'
          : 'obs_bundle'

    const baseName = filename
      .split(/[\\/]/)
      .pop()!
      .replace(/\.(overlay|zip)$/i, '')
    const suggestedName =
      (typeof manifest?.name === 'string' && manifest.name.trim()) ||
      (typeof primary.name === 'string' && primary.name.trim()) ||
      baseName ||
      'Imported pack'

    const scenes: OverlayPackPreviewScene[] = []
    const widgets: OverlayPackPreviewWidget[] = []
    const plannedOverlays: { scene: string; widgets: Widget[] }[] = []
    const unknownSources: OverlayPackUnknownSource[] = []
    const missingAssets: string[] = []
    const fontSpecs = new Map<string, { family: string; style: string; bundled: boolean }>()

    const addFont = (family: string | null, style = 'Regular') => {
      if (!family) return
      const key = family.toLowerCase()
      if (!fontSpecs.has(key)) {
        fontSpecs.set(key, { family, style, bundled: bundledFontNames.has(key) })
      }
    }

    const resolveAsset = (raw?: string | null) => {
      if (!raw) return
      const low = raw.trim().replace(/\\/g, '/').toLowerCase()
      const base = low.split('/').pop() ?? low
      if (!mediaMap.has(low) && !mediaMap.has(base)) {
        if (!missingAssets.includes(raw)) missingAssets.push(raw)
      }
    }

    if (Array.isArray(manifest?.fonts)) {
      for (const f of manifest.fonts) {
        addFont(cleanFontFamily(typeof f === 'string' ? f : null))
      }
    }

    let sourceCount = 0
    let webPages = 0

    if (primary.nodeType === 'RootNode') {
      const slScenes = (
        (primary.data as Record<string, unknown> | undefined)?.scenes as
          Record<string, unknown> | undefined
      )?.data as Record<string, unknown> | undefined
      const itemsList = Array.isArray(slScenes?.items)
        ? (slScenes.items as Record<string, unknown>[])
        : []
      if (!itemsList.length) {
        throw new HttpError(
          422,
          'overlay_no_scenes',
          "This theme pack doesn't contain any scenes.",
          'Export a .overlay archive with at least one scene inside.',
        )
      }
      for (const sc of itemsList) {
        const sname = String(sc.name ?? 'Scene').trim() || 'Scene'
        const slots = (
          (sc.slots as Record<string, unknown> | undefined)?.data as
            Record<string, unknown> | undefined
        )?.items
        const slotArr = Array.isArray(slots) ? (slots as Record<string, unknown>[]) : []
        let mapped = 0
        let wCount = 0
        let unkCount = 0
        const scWidgets: Widget[] = []
        for (const sl of slotArr) {
          if (sl.sceneNodeType === 'folder') continue
          const iname = String(sl.name ?? 'Layer')
          const content = sl.content as Record<string, unknown> | undefined
          const ntype = String(content?.nodeType ?? '')
          const data = (content?.data ?? {}) as Record<string, unknown>
          if (ntype === 'ImageNode' || ntype === 'VideoNode') {
            resolveAsset(typeof data.filename === 'string' ? data.filename : null)
            mapped += 1
            sourceCount += 1
          } else if (ntype === 'TextNode') {
            const settings = (data.settings ?? {}) as Record<string, unknown>
            const fobj = (settings.font ?? {}) as Record<string, unknown>
            addFont(
              cleanFontFamily(
                typeof fobj.face === 'string' ? fobj.face : null,
                typeof settings.custom_font === 'string' ? settings.custom_font : null,
              ),
            )
            mapped += 1
            sourceCount += 1
          } else if (ntype === 'WidgetNode') {
            const hit = mapWidgetKind(data.type)
            if (hit) {
              wCount += 1
              mapped += 1
              scWidgets.push(
                defaultWidget(
                  `w-${widgets.length + 1}`,
                  hit.kind,
                  Number(sl.x ?? 0) * 1920,
                  Number(sl.y ?? 0) * 1080,
                ),
              )
              widgets.push({
                scene: sname,
                name: iname,
                source_kind: String(data.type ?? 'widget'),
                mapped_to: hit.kind,
                overlay_widget_name: hit.label,
                supported: true,
              })
            } else {
              unkCount += 1
              const k = String(data.type ?? 'Widget')
              widgets.push({
                scene: sname,
                name: iname,
                source_kind: k,
                mapped_to: null,
                overlay_widget_name: 'Not supported',
                supported: false,
              })
              unknownSources.push({
                scene: sname,
                name: iname,
                kind: k,
                reason: "This third-party widget isn't available natively in Ferrocast yet.",
              })
            }
          } else if (ntype === 'StreamlabelNode') {
            wCount += 1
            mapped += 1
            const ts = (data.textSource as Record<string, unknown> | undefined)?.data as
              Record<string, unknown> | undefined
            const tset = (ts?.settings ?? {}) as Record<string, unknown>
            addFont(
              cleanFontFamily(
                typeof (tset.font as Record<string, unknown> | undefined)?.face === 'string'
                  ? ((tset.font as Record<string, unknown>).face as string)
                  : null,
                typeof tset.custom_font === 'string' ? tset.custom_font : null,
              ),
            )
            scWidgets.push(
              defaultWidget(
                `lbl-${widgets.length + 1}`,
                'label',
                Number(sl.x ?? 0) * 1920,
                Number(sl.y ?? 0) * 1080,
              ),
            )
            widgets.push({
              scene: sname,
              name: iname,
              source_kind: `Streamlabel (${String(data.labelType ?? 'follower')})`,
              mapped_to: 'label',
              overlay_widget_name: 'Label widget',
              supported: true,
            })
          } else if (
            [
              'WebcamNode',
              'GameCaptureNode',
              'IconLibraryNode',
              'SceneSourceNode',
              'SmartBrowserNode',
            ].includes(ntype)
          ) {
            if (ntype === 'SmartBrowserNode') webPages += 1
            mapped += 1
            sourceCount += 1
          } else {
            unkCount += 1
            unknownSources.push({
              scene: sname,
              name: iname,
              kind: ntype || 'unknown',
              reason: `Source type "${ntype}" isn't supported yet and was left out.`,
            })
          }
        }
        if (scWidgets.length) {
          plannedOverlays.push({ scene: sname, widgets: scWidgets })
          webPages += 1
        }
        scenes.push({
          name: sname,
          items: mapped + unkCount,
          mapped,
          widgets: wCount,
          unknown: unkCount,
        })
      }
    } else {
      const obsSources = Array.isArray(primary.sources)
        ? (primary.sources as Record<string, unknown>[])
        : []
      const rawScenes = obsSources.filter((s) => s.id === 'scene')
      const manifestScenes = Array.isArray(primary.scenes)
        ? (primary.scenes as Record<string, unknown>[])
        : []
      if (!rawScenes.length && !manifestScenes.length) {
        throw new HttpError(
          422,
          'overlay_no_scenes',
          "This theme pack doesn't contain any scenes.",
          'Export a .overlay archive with at least one scene inside.',
        )
      }
      for (const s of obsSources) {
        const settings = (s.settings ?? {}) as Record<string, unknown>
        if (typeof settings.file === 'string') resolveAsset(settings.file)
        if (typeof settings.local_file === 'string') resolveAsset(settings.local_file)
        const face = (settings.font as Record<string, unknown> | undefined)?.face
        addFont(cleanFontFamily(typeof face === 'string' ? face : null))
        sourceCount += 1
      }
      for (const sc of rawScenes.length ? rawScenes : manifestScenes) {
        const sname = String(sc.name ?? 'Scene')
        scenes.push({ name: sname, items: 1, mapped: 1, widgets: 0, unknown: 0 })
      }
    }

    return {
      suggestedName,
      format,
      canvas: { width: 1920, height: 1080 },
      scenes,
      widgets,
      plannedOverlays,
      unknownSources,
      missingAssets,
      mediaFiles,
      mediaBytes,
      fonts: Array.from(fontSpecs.values()),
      notes: [],
      sourceCount,
      webPages,
      missingKinds: [],
      doc: { name: suggestedName, current_scene: scenes[0]?.name ?? 'Main', sources: [] },
    }
  }
}

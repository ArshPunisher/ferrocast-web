// Community Theme Store client & types (API.md §4 Community Theme Store, R37).
//
// Everything fetched from the catalog is minisign-verified and SHA-256 hash-checked on the PC.
// Install counts and star ratings are read-only metadata; no telemetry is ever sent.

import type { FerroClient } from './client'
import type {
  AlertAnim,
  Condition,
  CustomField,
  CustomFieldValue,
  Design,
  EventKey,
  MotionTag,
  StyleTag,
} from './types'

export type StoreCategory = 'theme' | 'alert' | 'widget' | 'overlay' | 'plugin'
export type StorePackageFormat = 'ferrodesign' | 'ferroalert' | 'ferroplugin'

export interface StoreCreatorLinks {
  website?: string | null
  twitch?: string | null
  youtube?: string | null
  github?: string | null
}

export interface StoreCreator {
  id: string
  name: string
  handle: string
  bio: string
  verified: boolean
  links: StoreCreatorLinks
}

export interface StorePackage {
  format: StorePackageFormat
  url: string
  sha256: string
  size: number
}

export interface StoreAsset {
  name: string
  role: 'preview' | 'media'
  url: string
  sha256: string
  size: number
  mime: string
}

export interface StoreStats {
  installs: number
  rating_avg: number
  rating_count: number
}

export interface StoreCustomAlertVariation {
  id: string
  name: string
  condition: null | Condition
  priority: number
  weight: number
  title: string
  body: string
  sound: string | null
  volume: number
  duration_ms: number
  tts: boolean
  layout: string
  css: string
  anim: AlertAnim
  custom_enabled: boolean
  html: string
  fields: CustomField[]
  field_values: Record<string, CustomFieldValue>
}

export interface StoreCustomAlertPreview {
  html: string
  css: string
  fields: CustomField[]
  field_values: Record<string, CustomFieldValue>
}

export interface StorePreviewSpec {
  palette: [string, string, string]
  style: StyleTag
  motion: MotionTag
  headline?: string | null
  subline?: string | null
  layers_hint?: number | null
  design?: Design | null
  custom_alert?: StoreCustomAlertPreview | null
}

export interface StoreItem {
  id: string
  kind: StoreCategory
  title: string
  summary: string
  version: string
  creator_id: string
  tags: string[]
  license: string
  sandboxed: boolean
  plugin_kind?: 'effect' | 'logic' | 'panel' | null
  plugin_actions: string[]
  alert_events: EventKey[]
  featured: boolean
  created_at: number
  updated_at: number
  package: StorePackage
  assets: StoreAsset[]
  stats: StoreStats
  preview: StorePreviewSpec
  installed_version: string | null
  update_available: boolean
}

export interface StoreInstalledItem {
  item_id: string
  kind: StoreCategory
  format: StorePackageFormat
  title: string
  version: string
  creator_id: string
  creator_name: string
  installed_at: number
  updated_at: number
  package_sha256: string
  design_ids: string[]
  rule_ids: string[]
  plugin_id: string | null
  can_undo: boolean
  undo_token: string | null
  latest_version: string | null
  update_available: boolean
}

export interface StoreUndoSummary {
  token: string
  action: 'install' | 'update' | 'uninstall'
  item_id: string
  item_title: string
  created_at: number
}

export interface StoreCatalogResponse {
  version: 1
  generated_at: number
  fetched_at: number
  stale: boolean
  creators: StoreCreator[]
  items: StoreItem[]
  installed: StoreInstalledItem[]
  last_undo: StoreUndoSummary | null
  warnings: string[]
}

export interface StoreInstalledResponse {
  installed: StoreInstalledItem[]
  last_undo: StoreUndoSummary | null
}

export interface StoreMutationResult {
  action: 'install' | 'update' | 'uninstall'
  installed: StoreInstalledItem | null
  designs: Design[]
  undo: StoreUndoSummary
}

export interface StoreUndoResult {
  reverted_action: 'install' | 'update' | 'uninstall'
  item_id: string
  item_title: string
  installed: StoreInstalledItem[]
}

export interface StoreLinkPreview {
  uri: string
  action: 'install' | 'view'
  item: StoreItem
  creator: StoreCreator
  installed: StoreInstalledItem | null
  update_available: boolean
  safety_notes: string[]
  requires_confirmation: boolean
}

function hasUnsafeControlChars(raw: string): boolean {
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/** Strict client-side pre-check for `ferrocast://` install links before resolving on the engine. */
export function parseFerrocastStoreLink(
  raw: string,
): { action: 'install' | 'view'; id: string; version: string | null } | null {
  if (
    !raw ||
    raw.length > 512 ||
    raw !== raw.trim() ||
    raw.includes('\\') ||
    hasUnsafeControlChars(raw)
  ) {
    return null
  }
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'ferrocast:' || u.username || u.password) return null
  if (u.pathname.includes('%')) return null
  const segs = u.pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
  let action: 'install' | 'view'
  let id: string
  if (u.hostname === 'store' && segs[0] === 'install' && segs.length === 2) {
    action = 'install'
    id = segs[1] ?? ''
  } else if (u.hostname === 'install' && segs.length === 1) {
    action = 'install'
    id = segs[0] ?? ''
  } else if (u.hostname === 'store' && segs[0] === 'item' && segs.length === 2) {
    action = 'view'
    id = segs[1] ?? ''
  } else {
    return null
  }
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(id) || id.includes('..')) return null
  let version: string | null = null
  for (const [k, v] of u.searchParams.entries()) {
    if (k !== 'v') return null
    if (!/^[0-9][A-Za-z0-9._+-]{0,31}$/.test(v)) return null
    version = v
  }
  return { action, id, version }
}

/** Whether a host name or address is this machine, a local name or a private network. */
function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    )
  }
  if (host.includes(':')) {
    // The URL parser writes an IPv4-mapped address as hex groups (::ffff:7f00:1).
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host)
    if (mapped) {
      const hi = parseInt(mapped[1]!, 16)
      const lo = parseInt(mapped[2]!, 16)
      return isPrivateHost(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`)
    }
    const first = parseInt(host.split(':')[0] || '0', 16)
    return (
      host === '::' ||
      host === '::1' ||
      (first & 0xfe00) === 0xfc00 || // unique local
      (first & 0xffc0) === 0xfe80 // link-local
    )
  }
  return false
}

/** Validated safe https:// creator link (blocks javascript:, data:, http:, private hosts). */
export function safeCreatorLinkUrl(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 240 || /[\s<>]/.test(raw) || hasUnsafeControlChars(raw)) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' || u.username || u.password) return null
    // An IPv6 literal comes back in brackets: look at the address inside.
    const host = u.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, '')
      .replace(/\.$/, '')
    if (isPrivateHost(host)) return null
    return u.toString()
  } catch {
    return null
  }
}

export function storeApi(client: FerroClient) {
  return {
    catalog: (fresh = false) =>
      client.request<StoreCatalogResponse>(
        'GET',
        `/api/v1/store/catalog${fresh ? '?fresh=true' : ''}`,
      ),
    installed: () => client.request<StoreInstalledResponse>('GET', '/api/v1/store/installed'),
    // For an <img> or <audio>: it can't send a header, so the session goes in the query like the
    // PC's other media (the store routes are the PC's own).
    assetUrl: (itemId: string, name: string) => {
      const q = new URLSearchParams({ session: client.sessionToken ?? '' })
      return `${client.baseUrl}/api/v1/store/assets/${encodeURIComponent(itemId)}/${encodeURIComponent(name)}?${q.toString()}`
    },
    install: (id: string) =>
      client.request<StoreMutationResult>('POST', '/api/v1/store/install', { id }),
    update: (id: string) =>
      client.request<StoreMutationResult>('POST', '/api/v1/store/update', { id }),
    uninstall: (id: string) =>
      client.request<StoreMutationResult>('POST', '/api/v1/store/uninstall', { id }),
    undo: (token?: string) =>
      client.request<StoreUndoResult>('POST', '/api/v1/store/undo', token ? { token } : {}),
    resolveLink: (uri: string) =>
      client.request<StoreLinkPreview>('POST', '/api/v1/store/resolve-link', { uri }),
  }
}

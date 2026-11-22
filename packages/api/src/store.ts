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

/** Validated safe https:// creator link (blocks javascript:, data:, http:, private hosts). */
export function safeCreatorLinkUrl(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 240 || /[\s<>]/.test(raw) || hasUnsafeControlChars(raw)) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' || u.username || u.password) return null
    const host = u.hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.local') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return null
    }
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
    assetUrl: (itemId: string, name: string) =>
      `${client.baseUrl}/api/v1/store/assets/${encodeURIComponent(itemId)}/${encodeURIComponent(name)}`,
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

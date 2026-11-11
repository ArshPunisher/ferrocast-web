// Plugins (API.md: /api/v1/plugins): effects others make, added as a `.zip`. Safe by design:
// an effect runs on the graphics card with only the picture and its sliders.

import type { FerroClient } from './client'

/** An installed plugin. */
export interface Plugin {
  id: string
  name: string
  version: string
  author: string
  description: string
  /** What it is: "effect", "logic" (told about events) or "panel" (a page here). */
  kind: string
  /** The steps it may do (a logic plugin's or panel's), as Automations names them. */
  actions: string[]
  on: boolean
  /** Why it can't run now, or null. */
  problem: string | null
}

/** A plugin in Ferrocast's catalog (a signed list; its file checked before it's installed). */
export interface CatalogPlugin {
  id: string
  name: string
  version: string
  author: string
  description: string
  kind: string
  actions: string[]
  /** Its file's size in bytes. */
  size: number
  /** Its version here, or null when it isn't installed. */
  installed: string | null
  /** A later version than the one here. */
  update: boolean
}

/** The biggest plugin file the PC takes (2 MB). */
export const MAX_PLUGIN_BYTES = 2 * 1024 * 1024

export function pluginsApi(client: FerroClient) {
  return {
    list: () => client.request<Plugin[]>('GET', '/api/v1/plugins'),
    /** Installs (or updates) the plugin in `file`; it's checked first. */
    install: (file: Blob, name: string) => {
      const form = new FormData()
      form.append('file', file, name)
      return client.request<Plugin>('POST', '/api/v1/plugins', undefined, form)
    },
    setOn: (id: string, on: boolean) =>
      client.request<Plugin>('PUT', `/api/v1/plugins/${encodeURIComponent(id)}`, { on }),
    remove: (id: string) =>
      client.request<void>('DELETE', `/api/v1/plugins/${encodeURIComponent(id)}`),
    /** The catalog's plugins (read again when `fresh`). 503 `catalog_not_open` before it opens. */
    catalog: (fresh = false) =>
      client.request<{ plugins: CatalogPlugin[] }>(
        'GET',
        `/api/v1/plugins/catalog${fresh ? '?fresh=true' : ''}`,
      ),
    /** Installs (or updates) a catalog plugin: its file checked against the signed list first. */
    installFromCatalog: (id: string) =>
      client.request<Plugin>('POST', '/api/v1/plugins/catalog/install', { id }),
    /** A panel plugin's page, for a sandboxed frame. */
    panel: (id: string) =>
      client.request<{ html: string; actions: string[] }>(
        'GET',
        `/api/v1/plugins/${encodeURIComponent(id)}/panel`,
      ),
    /** A step a panel asked for (checked against what its plugin may do). */
    act: (id: string, step: unknown) =>
      client.request<void>('POST', `/api/v1/plugins/${encodeURIComponent(id)}/act`, step),
  }
}

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
  /** What it is: "effect" so far. */
  kind: string
  on: boolean
  /** Why it can't run now, or null. */
  problem: string | null
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
  }
}

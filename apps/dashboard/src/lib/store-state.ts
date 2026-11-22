// Pure state rules for the Community Store screen, kept out of the component so each can be
// tested without a browser.

import type { StoreCatalogResponse, StoreInstalledItem, StoreUndoSummary } from '@ferrocast/api'

/** Hands out numbers so only the newest request may change the screen. A request takes a number
 * when it starts and acts on its result only while that number is still current; `invalidate`
 * makes every request in flight stale (the dialog was closed, the screen left). */
export function latestOnly() {
  let current = 0
  return {
    next: () => ++current,
    isCurrent: (n: number) => n === current,
    invalidate: () => {
      current++
    },
  }
}

/** The catalog kept for offline use, with its installed flags taken from a fresh installed list:
 * a catalog that failed to reload must not keep offering Uninstall for what was removed. */
export function withInstalled(
  catalog: StoreCatalogResponse,
  installed: StoreInstalledItem[],
  lastUndo: StoreUndoSummary | null,
): StoreCatalogResponse {
  const by = new Map(installed.map((r) => [r.item_id, r]))
  return {
    ...catalog,
    installed,
    last_undo: lastUndo,
    items: catalog.items.map((it) => {
      const rec = by.get(it.id)
      return {
        ...it,
        installed_version: rec?.version ?? null,
        update_available: rec ? (rec.update_available ?? false) : false,
      }
    }),
  }
}

/** Installed rows that match the search box (title, creator, format, kind, id). */
export function filterInstalled(rows: StoreInstalledItem[], search: string): StoreInstalledItem[] {
  const q = search.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) =>
    [r.title, r.creator_name, r.format, r.kind, r.item_id].some((s) => s.toLowerCase().includes(q)),
  )
}

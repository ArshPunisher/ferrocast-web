// The design catalogue that ships inside Ferrocast (API.md §4 Designs). The overlay build
// writes it to `designs/catalog.json`, which the engine reads at start; the dashboard and the
// demo engine import it directly.

import type { Design } from '@ferrocast/api'
import { BUILTINS } from './registry'

export { BUILTINS }

export const CATALOG_FORMAT = 'ferrocast-designs'
export const CATALOG_VERSION = 1

export interface Catalog {
  format: typeof CATALOG_FORMAT
  version: typeof CATALOG_VERSION
  designs: Design[]
}

export function catalog(): Catalog {
  return {
    format: CATALOG_FORMAT,
    version: CATALOG_VERSION,
    designs: structuredClone([...BUILTINS]),
  }
}

export function builtin(id: string): Design | undefined {
  return BUILTINS.find((d) => d.id === id)
}

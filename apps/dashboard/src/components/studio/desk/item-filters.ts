// Which filters a drawer edits. A picture in a scene (an item) may have its own copy of the
// source's picture filters ("This picture only"): a camera in Vertical then keeps its own look.
// Without its own, or with no item (the mixer's row), the source's are edited ("Everywhere this
// source is used"). Sound filters always stay on the source; the engine's item routes know that.

import { useMemo } from 'react'
import type {
  EngineFilter,
  EngineFilterEdit,
  EngineItem,
  EngineSettings,
  NewEngineSource,
} from '@ferrocast/api'
import { useDesk, type EngineApi } from './common'

type Api = EngineApi

/** The same calls as the source's filter routes, aimed at the right list. */
export interface FilterApi {
  filters: (name: string) => Promise<EngineFilter[]>
  addFilter: (name: string, f: NewEngineSource) => Promise<void>
  removeFilter: (name: string, filter: string) => Promise<void>
  editFilter: (name: string, filter: string, what: EngineFilterEdit) => Promise<void>
  filterSettings: (name: string, filter: string) => Promise<EngineSettings>
  filterOptions: (name: string, filter: string) => ReturnType<Api['filterOptions']>
  updateFilter: (name: string, filter: string, s: EngineSettings) => Promise<void>
  /** The source's picture, with the filters this list has. */
  picture: (name: string, w: number, filters: boolean) => ReturnType<Api['sourcePicture']>
}

export function filterApi(api: Api, scene: string, item: EngineItem | null): FilterApi {
  if (!item?.own_filters) {
    return {
      filters: api.filters,
      addFilter: api.addFilter,
      removeFilter: api.removeFilter,
      editFilter: api.editFilter,
      filterSettings: api.filterSettings,
      filterOptions: api.filterOptions,
      updateFilter: api.updateFilter,
      picture: (name, w, filters) => api.sourcePicture(name, w, filters),
    }
  }
  const id = item.id
  return {
    filters: () => api.itemFilters(scene, id),
    addFilter: (_n, f) => api.addItemFilter(scene, id, f),
    removeFilter: (_n, f) => api.removeItemFilter(scene, id, f),
    editFilter: (_n, f, what) => api.editItemFilter(scene, id, f, what),
    filterSettings: (_n, f) => api.itemFilterSettings(scene, id, f),
    filterOptions: (_n, f) => api.itemFilterOptions(scene, id, f),
    updateFilter: (_n, f, s) => api.updateItemFilter(scene, id, f, s),
    // Without its filters it is the source's own picture, the same for every item.
    picture: (name, w, filters) =>
      filters ? api.itemPicture(scene, id, w, true) : api.sourcePicture(name, w, false),
  }
}

/** The item of the scene being shown that holds this source, or null (a mixer row). */
export function useItemOf(name: string): EngineItem | null {
  const { items } = useDesk()
  return items.data?.flatMap((i) => [i, ...i.children]).find((i) => i.name === name) ?? null
}

/** The filter calls for a source's drawer, aimed at this picture's own filters when it has them. */
export function useFilterApi(name: string): FilterApi {
  const { api, scene } = useDesk()
  const item = useItemOf(name)
  const id = item?.id
  const own = !!item?.own_filters
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => filterApi(api, scene, item), [api, scene, id, own])
}

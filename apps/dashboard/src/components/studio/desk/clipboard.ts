// The Studio's clipboard in the Sources dock: copy a source (or its filters) in one collection,
// paste it in another. The engine keeps the copy; the page reads it, so it shows in every menu.

import { useCallback, useEffect } from 'react'
import type { EngineClipboard } from '@ferrocast/api'
import type { EngineApi } from './common'
import { toast } from '@ferrocast/ui'
import { create } from 'zustand'
import { useAction } from '../../../lib/hooks'

const useClipStore = create<{
  clip: EngineClipboard | null
  set: (c: EngineClipboard | null) => void
}>((set) => ({ clip: null, set: (clip) => set({ clip }) }))

/** Counts copies that succeeded: a read that began before one must not overwrite it. */
let copies = 0

/** What a key press means for the clipboard, if anything. `editing` is true while the key goes
 * to a text field (or an editable area), `selection` while text is selected: those keep their
 * own copy and paste, so the page never takes them. */
export function clipboardKey(
  e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
  mac: boolean,
  state: { editing: boolean; selection: boolean },
): 'copy' | 'paste' | null {
  if (state.editing || e.altKey || e.shiftKey) return null
  if (!(mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)) return null
  const k = e.key.toLowerCase()
  if (k === 'c') return state.selection ? null : 'copy'
  if (k === 'v') return 'paste'
  return null
}

/** Whether a key press is going to something the user types in. */
export function isEditing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
}

/** What the paste said happened beyond the paste itself, each as a warning. */
export function showNotes(notes: string[] | undefined): void {
  for (const message of notes ?? []) toast({ tone: 'warn', message })
}

export interface StudioClipboard {
  clip: EngineClipboard | null
  busy: string | null
  copySource: (scene: string, id: number, name: string) => void
  copyFilters: (name: string, item?: { scene: string; id: number }) => void
  /** Pastes the copied source into `scene`; `done` runs when it went in. */
  pasteSource: (scene: string, done: () => void) => void
  pasteFilters: (
    name: string,
    item: { scene: string; id: number } | undefined,
    label: string,
  ) => void
}

export function useStudioClipboard(api: EngineApi, running = true): StudioClipboard {
  const clip = useClipStore((s) => s.clip)
  const set = useClipStore((s) => s.set)
  const { run, busy } = useAction()
  useEffect(() => {
    if (!running) return
    let alive = true
    const before = copies
    api
      .clipboard()
      .then((c) => alive && copies === before && set(c))
      // Nothing copied (a 404) or no app to ask: nothing to paste.
      .catch(() => alive && copies === before && set(null))
    return () => {
      alive = false
    }
  }, [api, running, set])
  const copySource = useCallback(
    (scene: string, id: number, name: string) =>
      void run('copy', () => api.copySource(scene, id), {
        once: true,
        success: `Copied ${name}. Paste it here or in another collection.`,
      }).then((c) => {
        if (!c) return
        copies++
        set(c)
      }),
    [api, run, set],
  )
  const copyFilters = useCallback(
    (name: string, item?: { scene: string; id: number }) =>
      void run('copy', () => api.copyFilters(name, item), {
        once: true,
        success: (c) => `Copied ${c.count} filter${c.count === 1 ? '' : 's'} of ${c.name}.`,
      }).then((c) => {
        if (!c) return
        copies++
        set(c)
      }),
    [api, run, set],
  )
  const pasteSource = useCallback(
    (scene: string, done: () => void) =>
      void run('paste-clip', () => api.pasteSource(scene), {
        once: true,
        success: (r) => `Pasted ${r.item?.name ?? 'the source'}.`,
      }).then((r) => {
        if (!r) return
        showNotes(r.notes)
        done()
      }),
    [api, run],
  )
  const pasteFilters = useCallback(
    (name: string, item: { scene: string; id: number } | undefined, label: string) =>
      void run('paste-clip', () => api.pasteFilterClip(name, item), {
        once: true,
        success: `Filters pasted onto ${label}.`,
      }).then((r) => r && showNotes(r.notes)),
    [api, run],
  )
  return { clip, busy, copySource, copyFilters, pasteSource, pasteFilters }
}

/** The line a menu entry shows for what is copied. */
export function clipLabel(c: EngineClipboard | null): string {
  if (!c) return ''
  return c.kind === 'filters'
    ? `${c.count} filter${c.count === 1 ? '' : 's'} of ${c.name}`
    : c.count > 1
      ? `${c.name} (${c.count} sources)`
      : c.name
}

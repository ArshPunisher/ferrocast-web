// What the Add dialog shows for each kind (its form with the cameras, screens and mics on this
// computer, and its defaults), kept for the app's life so a kind opens at once: the last list
// shows straight away and a fresh read replaces it a moment later (reading the cameras can take
// seconds on Windows: owner, 8 Nov, "it should be instant in any condition").

import { useCallback, useEffect, useState } from 'react'
import { type EngineOption, type EngineSettings } from '@ferrocast/api'
import { type EngineApi } from './common'

type Engine = Pick<EngineApi, 'options' | 'defaults'>

const forms = new Map<string, EngineOption[]>()
const defaults = new Map<string, EngineSettings>()
const reading = new Map<string, Promise<EngineOption[]>>()
const readingDefaults = new Map<string, Promise<EngineSettings>>()
const subs = new Set<() => void>()

function changed() {
  for (const cb of subs) cb()
}

/** The last form read for `kind`, if any. */
export function cachedForm(kind: string): EngineOption[] | undefined {
  return forms.get(kind)
}

/** Reads `kind`'s form now (one read at a time per kind; asks made meanwhile share it). */
export function readForm(api: Engine, kind: string): Promise<EngineOption[]> {
  const on = reading.get(kind)
  if (on) return on
  const p = api
    .options(kind)
    .then((o) => {
      forms.set(kind, o)
      changed()
      return o
    })
    .finally(() => reading.delete(kind))
  reading.set(kind, p)
  return p
}

/** `kind`'s defaults: they never change while the app runs, so read once. */
export function readDefaults(api: Engine, kind: string): Promise<EngineSettings> {
  const have = defaults.get(kind)
  if (have) return Promise.resolve(have)
  const on = readingDefaults.get(kind)
  if (on) return on
  const p = api
    .defaults(kind)
    .then((d) => {
      defaults.set(kind, d)
      return d
    })
    .finally(() => readingDefaults.delete(kind))
  readingDefaults.set(kind, p)
  return p
}

/** Reads these kinds ahead (the dialog opening, or the Studio settling), quietly. */
export function readAhead(api: Engine, kinds: Iterable<string>) {
  for (const k of new Set(kinds)) {
    if (!reading.has(k)) void readForm(api, k).catch(() => undefined)
    if (!defaults.has(k)) void readDefaults(api, k).catch(() => undefined)
  }
}

export interface KindForm {
  /** The form and defaults: the last ones read straight away, the fresh ones when they come. */
  data: [EngineOption[], EngineSettings] | null
  error: unknown
  /** A fresh read is on its way (the list shown may be a moment old). */
  checking: boolean
  /** Reads the devices again (a camera plugged in). */
  reload: () => void
}

/**
 * A kind's form for the Add dialog: what was read before at once, then read again so a device
 * plugged in since shows. `kind` null: nothing to read (a scene).
 */
export function useKindForm(api: Engine, kind: string | null): KindForm {
  const [, bump] = useState(0)
  const [error, setError] = useState<unknown>(null)
  const [checking, setChecking] = useState(false)
  const [nonce, setNonce] = useState(0)
  const [defs, setDefs] = useState<EngineSettings | null>(() =>
    kind ? (defaults.get(kind) ?? null) : {},
  )
  useEffect(() => {
    const cb = () => bump((n) => n + 1)
    subs.add(cb)
    return () => {
      subs.delete(cb)
    }
  }, [])
  useEffect(() => {
    if (!kind) return
    let alive = true
    setError(null)
    setChecking(true)
    // Defaults first when they're missing (rare: read ahead when the dialog opened).
    const d = defaults.get(kind)
    if (d) setDefs(d)
    else
      void readDefaults(api, kind)
        .then((v) => alive && setDefs(v))
        .catch((e: unknown) => alive && setError(e))
    readForm(api, kind)
      .catch((e: unknown) => {
        if (alive) setError(e)
      })
      .finally(() => {
        if (alive) setChecking(false)
      })
    return () => {
      alive = false
    }
  }, [api, kind, nonce])
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const form = kind ? forms.get(kind) : []
  const data: [EngineOption[], EngineSettings] | null = form && defs ? [form, defs] : null
  return {
    data,
    // An error only matters when there's nothing to show.
    error: data ? null : error,
    checking,
    reload,
  }
}

/** Forgets everything read (tests). */
export function forgetForms() {
  forms.clear()
  defaults.clear()
  reading.clear()
  readingDefaults.clear()
}

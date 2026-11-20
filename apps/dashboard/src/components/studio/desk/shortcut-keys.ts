// Shortcut keys: an action may have several (joined with "|" in the settings), and one key may
// run several actions (OBS allows both). Pure helpers for the Shortcuts page.

export const MAX_KEYS = 4

/** The keys an action has, in order. */
export function keysOf(value: string | undefined): string[] {
  return (value ?? '').split('|').filter(Boolean)
}

/** The value to save for these keys (null: none, remove the action). One of each, at most 4. */
export function joinKeys(keys: string[]): string | null {
  const unique = [...new Set(keys)].slice(0, MAX_KEYS)
  return unique.length ? unique.join('|') : null
}

export type Hotkeys = Record<string, string>

/** Every action that uses `key`. */
export function usersOf(hotkeys: Hotkeys, key: string): string[] {
  return Object.entries(hotkeys)
    .filter(([, v]) => keysOf(v).includes(key))
    .map(([id]) => id)
}

/** The other actions that share one of this action's keys, by key. */
export function sharedWith(hotkeys: Hotkeys, id: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const k of keysOf(hotkeys[id])) {
    const others = usersOf(hotkeys, k).filter((x) => x !== id)
    if (others.length) out[k] = others
  }
  return out
}

/** `key` added to an action (nothing changes at the limit or when it's there already). */
export function addKey(hotkeys: Hotkeys, id: string, key: string): Hotkeys {
  const next = joinKeys([...keysOf(hotkeys[id]), key])
  return withKeys(hotkeys, id, next)
}

/** `key` taken off an action. */
export function removeKey(hotkeys: Hotkeys, id: string, key: string): Hotkeys {
  return withKeys(hotkeys, id, joinKeys(keysOf(hotkeys[id]).filter((k) => k !== key)))
}

/** An action's keys set to what they were (null: none). */
export function withKeys(hotkeys: Hotkeys, id: string, value: string | null | undefined): Hotkeys {
  const next = { ...hotkeys }
  if (value) next[id] = value
  else delete next[id]
  return next
}

/** Does the action use this key (for "find by key")? */
export function usesKey(hotkeys: Hotkeys, id: string, key: string): boolean {
  return keysOf(hotkeys[id]).includes(key)
}

// The asset-pack importer's brain: reads a zip (or loose files) of PNG, GIF, WebP, JPEG, WebM,
// MP4, MP3, OGG and WAV files, guesses which alert each file is for from its name, and pairs
// pictures with sounds. Pure, so it is tested without a browser. Nothing here touches disk:
// files only reach the media library through the normal upload, with its own checks.

import { unzipSync } from 'fflate'
import { fallbacks, type EventKey } from '@ferrocast/api'

export type Slot = EventKey | 'screen' | 'library' | 'skip'
export type FileKind = 'image' | 'video' | 'sound'

export interface PackFile {
  name: string
  kind: FileKind
  bytes: number
  blob: Blob
}

export interface PackRow {
  id: string
  slot: Slot
  visual: PackFile | null
  sound: PackFile | null
  note: string | null
}

export const MAX_PACK = 200 * 1024 * 1024
export const MAX_FILES = 500
const LIMIT: Record<FileKind, number> = {
  image: 10 * 1024 * 1024,
  sound: 5 * 1024 * 1024,
  video: 50 * 1024 * 1024,
}
const EXT: Record<string, { kind: FileKind; mime: string }> = {
  png: { kind: 'image', mime: 'image/png' },
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  gif: { kind: 'image', mime: 'image/gif' },
  webp: { kind: 'image', mime: 'image/webp' },
  webm: { kind: 'video', mime: 'video/webm' },
  mp4: { kind: 'video', mime: 'video/mp4' },
  mp3: { kind: 'sound', mime: 'audio/mpeg' },
  ogg: { kind: 'sound', mime: 'audio/ogg' },
  wav: { kind: 'sound', mime: 'audio/wav' },
}

/** Words in a file name, most specific first ("resub" before "sub", "superchat" before "tip"). */
const RULES: [RegExp, Slot][] = [
  [/^re-?subs?$|^resub/, 'resub'],
  [/^gift|^community$/, 'gift'],
  [/^member/, 'member'],
  [/^subs?$|^subscri(ber|bers|ption|ptions|be|bed)$/, 'sub'],
  [/^superchats?$|^superstickers?$/, 'superchat'],
  [/^kicks?$/, 'kicks'],
  [/^bits?$|^cheers?$/, 'bits'],
  [/^follow/, 'follow'],
  [/^raid|^host$/, 'raid'],
  [/^redeem|^rewards?$|^points?$/, 'redeem'],
  [/^donat|^tips?$/, 'tip'],
  [/^starting$|^brb$|^ending$|^offline$|^intermission$|^paused?$/, 'screen'],
]

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** Which alert a file name is for. */
export function classify(name: string): Slot {
  const n = baseName(name)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
  const joined = n.replace(/[^a-z0-9]+/g, '')
  if (/rightback/.test(joined) || /resub/.test(joined) || /superchat/.test(joined)) {
    if (joined.includes('resub')) return 'resub'
    if (joined.includes('superchat')) return 'superchat'
    return 'screen'
  }
  const words = n.split(/[^a-z0-9]+/).filter(Boolean)
  for (const [re, slot] of RULES) if (words.some((w) => re.test(w))) return slot
  return 'library'
}

export function kindOf(name: string): { kind: FileKind; mime: string } | null {
  return EXT[name.toLowerCase().split('.').pop() ?? ''] ?? null
}

/**
 * Unzips a pack in memory; folders, hidden files and macOS metadata are left out. Sizes are
 * checked from the zip's own directory before anything inflates, so a zip bomb stops here.
 */
export function unzipPack(bytes: Uint8Array): { name: string; data: Uint8Array }[] {
  let total = 0
  let count = 0
  let tooBig: string | null = null
  const entries = unzipSync(bytes, {
    filter: (f) => {
      if (f.name.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(f.name)) return false
      const k = kindOf(baseName(f.name))
      if (!k || f.originalSize > LIMIT[k.kind]) return false
      total += f.originalSize
      count += 1
      if (total > MAX_PACK || count > MAX_FILES) {
        tooBig ??=
          total > MAX_PACK
            ? `The pack unpacks to more than ${MAX_PACK / 1048576} MB.`
            : `The pack has more than ${MAX_FILES} files.`
        return false
      }
      return true
    },
  })
  if (tooBig) throw new Error(`${tooBig} Split it into smaller zips, or drop the files you need.`)
  return Object.entries(entries).map(([name, data]) => ({ name, data }))
}

/**
 * Builds the review table: one row per alert (its picture or video and its sound, paired by
 * slot), screens, and everything else for the media library. Files Ferrocast can't play are
 * listed as skipped with the reason.
 */
export function planPack(files: { name: string; blob: Blob }[]): {
  rows: PackRow[]
  skipped: string[]
} {
  const skipped: string[] = []
  const bySlot = new Map<Slot, PackRow>()
  const rows: PackRow[] = []
  let total = 0
  let n = 0
  for (const f of files.slice(0, MAX_FILES)) {
    const name = baseName(f.name)
    const k = kindOf(name)
    if (!k) {
      skipped.push(`${name}: not a picture, video or sound Ferrocast plays`)
      continue
    }
    if (f.blob.size > LIMIT[k.kind]) {
      skipped.push(`${name}: over ${LIMIT[k.kind] / 1048576} MB`)
      continue
    }
    total += f.blob.size
    if (total > MAX_PACK) {
      skipped.push(`${name}: the pack is over ${MAX_PACK / 1048576} MB`)
      continue
    }
    const file: PackFile = {
      name,
      kind: k.kind,
      bytes: f.blob.size,
      blob: f.blob.type ? f.blob : f.blob.slice(0, f.blob.size, k.mime),
    }
    const slot = classify(name)
    const isSound = k.kind === 'sound'
    const existing = slot !== 'library' && slot !== 'screen' ? bySlot.get(slot) : undefined
    if (existing && (isSound ? !existing.sound : !existing.visual)) {
      if (isSound) existing.sound = file
      else existing.visual = file
      continue
    }
    const row: PackRow = {
      id: `r${n++}`,
      slot: existing ? 'library' : slot,
      visual: isSound ? null : file,
      sound: isSound ? file : null,
      note: null,
    }
    if (slot === 'screen' && isSound) row.slot = 'library'
    if (row.slot !== 'library' && row.slot !== 'screen') bySlot.set(row.slot, row)
    rows.push(row)
  }
  if (files.length > MAX_FILES)
    skipped.push(`${files.length - MAX_FILES} more files: a pack can have up to ${MAX_FILES}`)
  return { rows, skipped }
}

/** Event keys that should use a row's files: its own, and plainer-look events without one. */
export function keysFor(
  slot: EventKey,
  taken: Set<EventKey>,
  all: readonly EventKey[],
): EventKey[] {
  return all.filter((k) => k === slot || (!taken.has(k) && fallbacks(k)[1] === slot))
}

import { describe, expect, it } from 'vitest'
import { zipSync } from 'fflate'
import { EVENT_KEYS } from '@ferrocast/api'
import { classify, keysFor, planPack, unzipPack } from './asset-pack'

const blob = (n = 10) => new Blob([new Uint8Array(n)])

/** Rewrites every central-directory entry's uncompressed size, as a zip bomb's would read. */
function claimSize(zip: Uint8Array, bytes: number): Uint8Array {
  const out = zip.slice()
  const view = new DataView(out.buffer)
  for (let i = 0; i + 46 <= out.length; i++)
    if (view.getUint32(i, true) === 0x02014b50) view.setUint32(i + 24, bytes, true)
  return out
}

describe('asset pack importer', () => {
  it('guesses the alert from file names, most specific first', () => {
    const cases: [string, string][] = [
      ['Alerts/follow.webm', 'follow'],
      ['new_follower_alert.png', 'follow'],
      ['resub.webm', 'resub'],
      ['Sub Alert.gif', 'sub'],
      ['subscriber.mp3', 'sub'],
      ['gift_sub.webm', 'gift'],
      ['community-gifts.png', 'gift'],
      ['membership.webm', 'member'],
      ['bits_cheer.gif', 'bits'],
      ['kicks.webm', 'kicks'],
      ['superchat.png', 'superchat'],
      ['donation.gif', 'tip'],
      ['TIP-sound.wav', 'tip'],
      ['raid_incoming.webm', 'raid'],
      ['host.png', 'raid'],
      ['reward-redeem.webm', 'redeem'],
      ['brb_screen.png', 'screen'],
      ['Starting Soon.mp4', 'screen'],
      ['panel_about.png', 'library'],
      ['subtle-glow.png', 'library'],
    ]
    for (const [name, slot] of cases) expect(classify(name), name).toBe(slot)
  })

  it('pairs a picture with its sound, keeps extras in the library and skips what it can’t play', () => {
    const { rows, skipped } = planPack([
      { name: 'follow.webm', blob: blob() },
      { name: 'follow.mp3', blob: blob() },
      { name: 'follow-alt.png', blob: blob() },
      { name: 'donation.gif', blob: blob() },
      { name: 'coins_tip.wav', blob: blob() },
      { name: 'brb.png', blob: blob() },
      { name: 'logo.svg', blob: blob() },
      { name: 'readme.txt', blob: blob() },
      { name: 'huge-sub.mp3', blob: blob(6 * 1024 * 1024) },
    ])
    const follow = rows.find((r) => r.slot === 'follow')
    expect([follow?.visual?.name, follow?.sound?.name]).toEqual(['follow.webm', 'follow.mp3'])
    expect(rows.find((r) => r.visual?.name === 'follow-alt.png')?.slot).toBe('library')
    const tip = rows.find((r) => r.slot === 'tip')
    expect([tip?.visual?.name, tip?.sound?.name]).toEqual(['donation.gif', 'coins_tip.wav'])
    expect(rows.find((r) => r.visual?.name === 'brb.png')?.slot).toBe('screen')
    expect(skipped.join(' ')).toMatch(/logo\.svg.*not a picture/)
    expect(skipped.join(' ')).toMatch(/readme\.txt/)
    expect(skipped.join(' ')).toMatch(/huge-sub\.mp3: over 5 MB/)
  })

  it('reads a zip without folders, hidden files or macOS metadata', () => {
    const zip = zipSync({
      'Pack/Alerts/follow.webm': new Uint8Array([1]),
      'Pack/.DS_Store': new Uint8Array([1]),
      '__MACOSX/Pack/._follow.webm': new Uint8Array([1]),
      '../../escape.png': new Uint8Array([1]),
    })
    const names = unzipPack(zip).map((e) => e.name)
    expect(names).toContain('Pack/Alerts/follow.webm')
    expect(names.some((n) => n.includes('DS_Store') || n.includes('MACOSX'))).toBe(false)
    // Paths never matter: only the base name is used.
    expect(planPack([{ name: '../../escape.png', blob: blob() }]).rows[0]?.visual?.name).toBe(
      'escape.png',
    )
  })

  it('stops a zip bomb from its directory, before inflating', () => {
    // A bomb's directory claims sizes its data doesn't have; patching the claim keeps the
    // test fast (building 200 MB for real timed out on CI).
    const files: Record<string, Uint8Array> = {}
    for (let i = 0; i < 40; i++) files[`frame-${i}.webm`] = new Uint8Array([1])
    const bomb = claimSize(zipSync(files, { level: 0 }), Math.ceil((201 * 1024 * 1024) / 30))
    expect(() => unzipPack(bomb)).toThrow(/more than 200 MB/)
    const many: Record<string, Uint8Array> = {}
    for (let i = 0; i < 520; i++) many[`f${i}.png`] = new Uint8Array([1])
    expect(() => unzipPack(zipSync(many))).toThrow(/more than 500 files/)
  })

  it('a sub look also dresses resubs and memberships that have no file of their own', () => {
    expect(keysFor('sub', new Set(['sub']), EVENT_KEYS).sort()).toEqual([
      'gift',
      'member',
      'resub',
      'sub',
    ])
    expect(keysFor('sub', new Set(['sub', 'resub']), EVENT_KEYS).sort()).toEqual([
      'gift',
      'member',
      'sub',
    ])
    expect(keysFor('tip', new Set(['tip']), EVENT_KEYS).sort()).toEqual(['superchat', 'tip'])
  })
})

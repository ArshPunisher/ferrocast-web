// Sample events for every testable kind (core::sample), so previews and "Test alert" work
// with nothing connected (R-33).

import type { Actor, EventKind, FerroEvent, Platform } from './types'

export const TESTABLE = [
  'follow',
  'subscription',
  'gift_batch',
  'platform_gift',
  'paid_message',
  'tip',
  'raid',
  'reward_redemption',
] as const
export type TestableKind = (typeof TESTABLE)[number]

export const KIND_LABEL: Record<string, string> = {
  follow: 'Follow',
  subscription: 'Sub',
  gift_batch: 'Gifted subs',
  platform_gift: 'Bits / KICKs',
  paid_message: 'Super Chat',
  tip: 'Tip',
  raid: 'Raid',
  reward_redemption: 'Channel points',
}

export function namedActor(platform: Platform, name: string, extra: Partial<Actor> = {}): Actor {
  return {
    platform,
    id: null,
    login: name.toLowerCase().replace(/\s+/g, ''),
    display_name: name,
    avatar_url: null,
    color: null,
    roles: 0,
    badges: [],
    anonymous: false,
    ...extra,
  }
}

const plain = (text: string) => ({ text, fragments: [{ type: 'text' as const, text }] })

let sampleSeq = 0

/** A sample of `kind` on `platform`, or null when that platform has no such event. */
export function sample(kind: string, platform: Platform, at = Date.now()): FerroEvent | null {
  const who = (n: string) => namedActor(platform, n)
  let k: EventKind | null = null
  const tk = platform === 'twitch' || platform === 'kick'
  switch (kind) {
    case 'follow':
      if (tk) k = { type: 'follow', actor: who('NovaRiver') }
      break
    case 'subscription':
      if (tk)
        k = {
          type: 'subscription',
          actor: who('PixelPanda'),
          tier: { type: 'tier1' },
          months: 6,
          message: plain('Six months already, love the streams'),
          gifted_by: null,
        }
      else if (platform === 'youtube')
        k = {
          type: 'subscription',
          actor: who('Meera Plays'),
          tier: { type: 'level', id: 'lvl1', name: 'Member' },
          months: 1,
          message: null,
          gifted_by: null,
        }
      break
    case 'gift_batch':
      if (tk || platform === 'youtube')
        k = { type: 'gift_batch', gifter: who('GiftGoblin'), tier: { type: 'tier1' }, count: 5 }
      break
    case 'platform_gift':
      if (platform === 'twitch')
        k = {
          type: 'platform_gift',
          actor: who('BitBaron'),
          value: { unit: 'bits', amount: 500 },
          message: plain('Cheer500 clutch play'),
        }
      else if (platform === 'kick')
        k = {
          type: 'platform_gift',
          actor: who('KickKing'),
          value: { unit: 'kicks', amount: 100 },
          message: null,
        }
      break
    case 'paid_message':
      if (platform === 'youtube')
        k = {
          type: 'paid_message',
          actor: who('Arjun'),
          money: { minor: 19_900, currency: 'INR' },
          content: plain('Super Chat for the win'),
          sticker_url: null,
        }
      break
    case 'tip':
      k = {
        type: 'tip',
        actor: namedActor('tips', 'Asha'),
        money: { minor: 50_000, currency: 'INR' },
        message: 'Keep it up!',
        provider: 'razorpay',
        payment_ref: 'test',
        status: 'captured',
      }
      break
    case 'raid':
      if (tk) k = { type: 'raid', from: who('CaptainCozy'), viewers: 42 }
      break
    case 'reward_redemption':
      if (tk)
        k = {
          type: 'reward_redemption',
          actor: who('SnackAttack'),
          reward: 'Hydrate!',
          cost: 500,
          input: null,
        }
      break
  }
  if (!k) return null
  sampleSeq += 1
  return {
    id: `sample-${kind}-${platform}-${at}-${sampleSeq}`,
    seq: 0,
    platform: k.type === 'tip' ? 'tips' : platform,
    channel: null,
    source_id: null,
    occurred_at: at,
    received_at: at,
    origin: 'test',
    kind: k,
  }
}

/** The first platform with a sample for `kind`. */
export function anySample(kind: string, at = Date.now()): FerroEvent | null {
  for (const p of ['twitch', 'youtube', 'kick'] as const) {
    const e = sample(kind, p, at)
    if (e) return e
  }
  return null
}

/** Which chat platforms have a given kind (YouTube has no follows, Bits are Twitch only). */
export function platformsFor(kind: string): Platform[] {
  return (['twitch', 'youtube', 'kick'] as const).filter((p) => sample(kind, p, 0) !== null)
}

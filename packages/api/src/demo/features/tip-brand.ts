// Pro tip page branding and goal in the demo, matching the relay
// (`crates/relay/src/tips/{brand,goal}.rs`): 402 without Pro, the same contrast fixes,
// 404/413/415/422 for images, 422 `no_tip_page` for a goal without a tip page, and a goal
// that counts the demo's own captured tips in its currency (refunds come off).

import {
  TIP_BRAND_LIMITS,
  TIP_IMAGE_TYPES,
  currencyDigits,
  fixTipColours,
  normaliseHex,
  type TipBrand,
  type TipGoal,
  type TipImageKind,
} from '../../tip-brand'
import type { FerroEvent, TipSettings } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type DemoFeature, type Routed } from './host'

const PRO_REQUIRED = () =>
  new HttpError(
    402,
    'pro_required',
    'This runs on Ferrocast’s servers and is part of Pro.',
    'See Settings › Pro. Everything free in Ferrocast stays free.',
  )

interface StoredGoal {
  title: string
  target: number
  currency: string
  starts_at: number
  ends_at: number | null
  /** source id → minor units counted. */
  counted: Map<string, number>
}

export class DemoTipBrand implements DemoFeature {
  private colours: { accent: string; background: string; text: string } | null = null
  private images: Record<TipImageKind, string | null> = { avatar: null, banner: null }
  private goalState: StoredGoal | null = null

  constructor(
    /** Pro now, and the "relay" has the feature. */
    private readonly pro: () => boolean,
    private readonly tips: () => TipSettings,
  ) {}

  private view(changes: TipBrand['changes'] = []): TipBrand {
    return {
      accent: this.colours?.accent ?? null,
      background: this.colours?.background ?? null,
      text: this.colours?.text ?? null,
      avatar_url: this.images.avatar,
      banner_url: this.images.banner,
      applied: this.pro(),
      changes,
    }
  }

  private goalView(): TipGoal {
    const g = this.goalState
    if (!g)
      throw new HttpError(
        404,
        'not_found',
        'There’s no goal yet.',
        'Set one up on the Tips screen.',
      )
    const page = this.tips().page_url
    const raised = [...g.counted.values()].reduce((a, b) => a + b, 0)
    return {
      title: g.title,
      target: g.target,
      currency: g.currency,
      digits: currencyDigits(g.currency),
      starts_at: g.starts_at,
      ends_at: g.ends_at,
      ended: g.ends_at !== null && Date.now() >= g.ends_at,
      raised,
      tips: g.counted.size,
      page_url: page ? `${page}/goal` : null,
      overlay_url: page ? `${page}/goal?overlay=1` : null,
    }
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'tips' || (seg[1] !== 'brand' && seg[1] !== 'goal')) return NOT_MINE
    if (!this.pro()) throw PRO_REQUIRED()
    if (seg[1] === 'brand' && seg.length === 2) {
      if (method === 'GET') return this.view()
      if (method === 'DELETE') {
        this.colours = null
        return undefined
      }
      if (method === 'PUT') return this.saveColours(body)
      return NOT_MINE
    }
    if (seg[1] === 'brand' && seg.length === 3) {
      const kind = seg[2]
      if (kind !== 'avatar' && kind !== 'banner')
        throw new HttpError(
          404,
          'not_found',
          'There’s no such tip page image.',
          'Use avatar or banner.',
        )
      if (method === 'DELETE') {
        this.setImage(kind, null)
        return undefined
      }
      if (method === 'PUT') return this.saveImage(kind, body)
      return NOT_MINE
    }
    if (seg[1] === 'goal' && seg.length === 2) {
      if (method === 'GET') return this.goalView()
      if (method === 'DELETE') {
        this.goalState = null
        return undefined
      }
      if (method === 'PUT') return this.saveGoal(body)
    }
    return NOT_MINE
  }

  private saveColours(body: unknown): TipBrand {
    const b = requireObj(body)
    const pick = (k: 'accent' | 'background' | 'text') => {
      const v = typeof b[k] === 'string' ? normaliseHex(b[k]) : null
      if (!v) throw new HttpError(400, 'invalid', `${k} must be a hex colour like #3461f5.`)
      return v
    }
    const { colours, changes } = fixTipColours({
      accent: pick('accent'),
      background: pick('background'),
      text: pick('text'),
    })
    this.colours = colours
    return this.view(changes)
  }

  private setImage(kind: TipImageKind, url: string | null): void {
    const old = this.images[kind]
    if (old?.startsWith('blob:') && typeof URL.revokeObjectURL === 'function')
      URL.revokeObjectURL(old)
    this.images[kind] = url
  }

  private async saveImage(kind: TipImageKind, body: unknown): Promise<TipBrand> {
    const label = kind === 'avatar' ? 'Avatars' : 'Banners'
    if (!(body instanceof Blob) || !(TIP_IMAGE_TYPES as readonly string[]).includes(body.type))
      throw new HttpError(
        415,
        'unsupported_type',
        `${label} can be PNG, JPEG or WebP.`,
        'Save it as PNG, JPEG or WebP and try again (GIF, SVG and HEIC aren’t accepted).',
      )
    const max = kind === 'avatar' ? TIP_BRAND_LIMITS.avatarBytes : TIP_BRAND_LIMITS.bannerBytes
    if (body.size > max)
      throw new HttpError(
        413,
        'too_large',
        `${label} can be up to ${max / 1_000_000} MB.`,
        'Make the file smaller (or export it as JPEG) and try again.',
      )
    const head = new Uint8Array(await body.slice(0, 12).arrayBuffer())
    const is = (sig: number[], at = 0) => sig.every((b, i) => head[at + i] === b)
    const real = is([0x89, 0x50, 0x4e, 0x47])
      ? 'image/png'
      : is([0xff, 0xd8, 0xff])
        ? 'image/jpeg'
        : is([0x52, 0x49, 0x46, 0x46]) && is([0x57, 0x45, 0x42, 0x50], 8)
          ? 'image/webp'
          : null
    if (body.size === 0 || head.length < 4)
      throw new HttpError(422, 'image_unreadable', 'That image couldn’t be read.')
    if (!real) throw new HttpError(415, 'unsupported_type', `${label} can be PNG, JPEG or WebP.`)
    const url =
      typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(body)
        : `https://tip.clearcraftlabs.com/t/a/demo-${kind}.webp`
    this.setImage(kind, url)
    return this.view()
  }

  private saveGoal(body: unknown): TipGoal {
    const b = requireObj(body)
    const title = typeof b.title === 'string' ? b.title.trim() : ''
    if (Array.from(title).length < 1 || Array.from(title).length > TIP_BRAND_LIMITS.goalTitleMax)
      throw new HttpError(
        400,
        'invalid',
        `The goal title must be 1 to ${TIP_BRAND_LIMITS.goalTitleMax} characters.`,
      )
    const currency = typeof b.currency === 'string' ? b.currency.trim().toUpperCase() : ''
    if (!/^[A-Z]{3}$/.test(currency))
      throw new HttpError(400, 'invalid', 'currency must be a 3-letter code like INR or USD.')
    const target = b.target
    if (typeof target !== 'number' || !Number.isInteger(target) || target < 1 || target > 1e12)
      throw new HttpError(
        400,
        'invalid',
        'target must be a whole number above 0 in the currency’s smallest unit (₹500 is 50000).',
      )
    const ends = b.ends_at ?? null
    const now = Date.now()
    if (
      ends !== null &&
      (typeof ends !== 'number' ||
        ends <= now ||
        ends > now + TIP_BRAND_LIMITS.goalMaxDays * 86_400_000)
    )
      throw new HttpError(400, 'invalid', 'ends_at must be in the future and within a year.')
    if (!this.tips().page_url)
      throw new HttpError(
        422,
        'no_tip_page',
        'Create your tip page first.',
        'The goal page lives next to your tip page, at its link plus /goal.',
      )
    const same = this.goalState?.currency === currency
    this.goalState = {
      title,
      target,
      currency,
      starts_at: same && this.goalState ? this.goalState.starts_at : now,
      ends_at: ends,
      counted: same && this.goalState ? this.goalState.counted : new Map(),
    }
    return this.goalView()
  }

  /** The demo's tips count towards the goal like the relay counts verified ones. */
  onEvent(e: FerroEvent): void {
    const g = this.goalState
    // Only real tips: test alerts and replays never reach the relay's count.
    if (!g || !this.pro() || e.origin !== 'live') return
    const k = e.kind
    if (
      k.type === 'tip' &&
      k.status === 'captured' &&
      k.money.currency.toUpperCase() === g.currency
    ) {
      if (g.ends_at !== null && Date.now() >= g.ends_at) return
      g.counted.set(e.source_id ?? e.id, k.money.minor)
    }
    if (k.type === 'reversal') g.counted.delete(k.original_source_id)
  }

  /** Tests: the goal's raw state. */
  snapshot(): { colours: unknown; images: unknown; goal: TipGoal | null } {
    return {
      colours: clone(this.colours),
      images: clone(this.images),
      goal: this.goalState ? this.goalView() : null,
    }
  }
}

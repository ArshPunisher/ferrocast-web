// Loyalty points in the demo: the same routes, defaults and error copy as the engine
// (`ferrocast/crates/engine/src/loyalty.rs`, `server/src/routes/loyalty.rs`).

import type { Actor, LeaderboardEntry, LoyaltyConfig, PointsBalance } from '../../types'
import { POINTS_LIMITS } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, group, isWhole, requireObj, type DemoHost, type Routed } from './host'

export const DEFAULT_LOYALTY: LoyaltyConfig = {
  enabled: true,
  name: 'points',
  per_interval: 10,
  interval_min: 5,
  follow_bonus: 50,
  sub_bonus: 250,
  tip_bonus: 100,
  raid_bonus: 100,
}

const AMOUNTS = [
  'per_interval',
  'follow_bonus',
  'sub_bonus',
  'tip_bonus',
  'raid_bonus',
] as const satisfies readonly (keyof LoyaltyConfig)[]

/** "1,234 points", "1 point". */
export function pointsLabel(n: number, name: string): string {
  const unit =
    n === 1 && name.length > 1 && name.endsWith('s') && !name.endsWith('ss')
      ? name.slice(0, -1)
      : name
  return `${group(n)} ${unit}`
}

/** The engine's field checks for a whole config, with the same messages. */
export function loyaltyProblem(c: LoyaltyConfig): string | null {
  const name = c.name.trim()
  if (!name || [...name].length > 20)
    return 'name: call them something 1 to 20 characters long, like points.'
  if (!/^[\p{L}\p{N} _-]+$/u.test(name)) return 'name: use letters, numbers, spaces, - and _ only.'
  if (!isWhole(c.interval_min) || c.interval_min < 1 || c.interval_min > 120)
    return 'interval_min: must be between 1 and 120 minutes.'
  for (const k of AMOUNTS) if (c[k] > 1_000_000) return `${k}: must be between 0 and 1,000,000.`
  return null
}

const key = (platform: string, userId: string) => `${platform}:${userId}`

export class DemoLoyalty {
  config: LoyaltyConfig = clone(DEFAULT_LOYALTY)
  private readonly balances = new Map<string, number>()

  constructor(private readonly host: DemoHost) {
    for (const a of host.knownActors()) {
      if (!a.id || a.roles & 256) continue
      const seed = [...a.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
      this.balances.set(key(a.platform, a.id), (seed % 60) * 25 + 40)
    }
  }

  private actor(platform: string, userId: string): Actor | null {
    return this.host.knownActors().find((a) => a.platform === platform && a.id === userId) ?? null
  }

  private known(platform: string, userId: string): boolean {
    return this.balances.has(key(platform, userId)) || this.actor(platform, userId) !== null
  }

  balanceOf(platform: string, userId: string): number {
    return this.balances.get(key(platform, userId)) ?? 0
  }

  /** Takes `n` points if they have them. */
  spend(platform: string, userId: string, n: number): boolean {
    const have = this.balanceOf(platform, userId)
    if (have < n) return false
    this.balances.set(key(platform, userId), have - n)
    return true
  }

  credit(platform: string, userId: string, n: number): void {
    const next = Math.min(this.balanceOf(platform, userId) + n, POINTS_LIMITS.maxBalance)
    this.balances.set(key(platform, userId), next)
  }

  private view(points: number): PointsBalance {
    return { points, name: this.config.name }
  }

  private leaderboard(limit: number): LeaderboardEntry[] {
    const actors = this.host.knownActors()
    return [...this.balances.entries()]
      .filter(([, p]) => p > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .flatMap(([k, points], i) => {
        const a = actors.find((x) => key(x.platform, x.id ?? '') === k)
        if (!a?.id || a.platform === 'tips' || a.platform === 'ferrocast') return []
        return [
          {
            rank: i + 1,
            platform: a.platform,
            user_id: a.id,
            login: a.login ?? a.display_name,
            display_name: a.display_name,
            points,
          },
        ]
      })
  }

  route(method: string, seg: string[], body: unknown, url: URL): Routed {
    if (seg[0] !== 'loyalty') return NOT_MINE
    const [, b, platform, userId, action] = seg
    if (seg.length === 1 && method === 'GET') return clone(this.config)
    if (seg.length === 1 && method === 'PUT') {
      const patch = requireObj(body)
      const next = { ...this.config }
      for (const [k, v] of Object.entries(patch)) {
        if (!(k in next)) continue
        const cur = next[k as keyof LoyaltyConfig]
        if (typeof cur === 'boolean' && typeof v !== 'boolean')
          throw new HttpError(400, 'invalid', `${k}: must be true or false.`)
        if (typeof cur === 'number' && !(isWhole(v) && v >= 0))
          throw new HttpError(400, 'invalid', `${k}: must be a whole number of 0 or more.`)
        if (typeof cur === 'string' && typeof v !== 'string')
          throw new HttpError(400, 'invalid', `${k}: must be text.`)
        ;(next as Record<string, unknown>)[k] = v
      }
      next.name = next.name.trim()
      const problem = loyaltyProblem(next)
      if (problem) throw new HttpError(400, 'invalid', problem)
      this.config = next
      return clone(this.config)
    }
    if (b === 'leaderboard' && seg.length === 2 && method === 'GET') {
      const raw = url.searchParams.get('limit')
      const limit = raw === null ? 20 : Number(raw)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new HttpError(400, 'invalid', 'limit: must be a whole number from 1 to 100.')
      return this.leaderboard(limit)
    }
    if (b === 'viewers' && platform && userId) {
      if (!['twitch', 'youtube', 'kick'].includes(platform))
        throw new HttpError(
          400,
          'invalid',
          `"${platform}" isn't a platform; use twitch, youtube or kick.`,
        )
      if (!this.known(platform, userId))
        throw new HttpError(
          404,
          'viewer_not_found',
          'Ferrocast hasn’t seen this person yet.',
          'Points and viewer cards fill in once someone chats or follows while Ferrocast is running.',
        )
      if (seg.length === 4 && method === 'GET') return this.view(this.balanceOf(platform, userId))
      if (seg.length === 5 && action === 'adjust' && method === 'POST') {
        const delta = requireObj(body).delta
        if (delta === undefined)
          throw new HttpError(
            400,
            'invalid',
            'delta: say how many points to add (or take away, negative).',
          )
        if (!isWhole(delta)) throw new HttpError(400, 'invalid', 'delta: must be a whole number.')
        if (delta === 0 || Math.abs(delta) > POINTS_LIMITS.maxAdjust)
          throw new HttpError(
            400,
            'invalid',
            'delta: must be a whole number from -1,000,000,000 to 1,000,000,000, and not 0.',
          )
        const have = this.balanceOf(platform, userId)
        if (have + delta < 0)
          throw new HttpError(
            400,
            'invalid',
            `delta: they have ${pointsLabel(have, this.config.name)}, so you can take away at most ${group(have)}.`,
          )
        if (have + delta > POINTS_LIMITS.maxBalance)
          throw new HttpError(
            400,
            'invalid',
            `delta: that would put them over the limit of ${pointsLabel(POINTS_LIMITS.maxBalance, this.config.name)}.`,
          )
        this.balances.set(key(platform, userId), have + delta)
        return this.view(have + delta)
      }
    }
    return NOT_MINE
  }
}

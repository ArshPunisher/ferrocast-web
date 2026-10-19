// Pro's own tip address in the demo, like the relay (`crates/relay/src/tips/domains`): 402
// without Pro, 503 without the feature, 422 for an address that can't be used (apex, IP,
// wildcard, ours), 422 without a tip page, 409 for a second address or one taken (any
// `taken.` name; an `elsewhere.` name is on Cloudflare already and comes with the TXT record
// that would prove it, adopted once `setTipDomain({ proofPublished: true })`), 429 after 10 changes a day. Each check moves a new address one step on
// (pending → verifying → live, the TXT proof found from verifying on), as Cloudflare and the
// relay would; tests can set the state directly (including `proof_missing`).

import type { ProView } from '../../pro'
import {
  TIP_DOMAIN_LIMITS,
  normaliseTipDomain,
  tipDomainProblem,
  type TipDomain,
  type TipDomainStatus,
} from '../../tip-domain'
import type { TipSettings } from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type DemoFeature, type Routed } from './host'

const TARGET = 'tip.clearcraftlabs.com'
const DAY = 86_400_000

export interface DemoTipDomainState {
  /** An address already added (null removes it). */
  hostname?: string | null
  status?: TipDomainStatus
  /** Checks move it on by themselves (default on). */
  advance?: boolean
  changesToday?: number
  lapsed?: boolean
  /** The streamer published the TXT proof for an `elsewhere.` address. */
  proofPublished?: boolean
}

export class DemoTipDomain implements DemoFeature {
  private host: string | null = null
  private unicode = ''
  private status: TipDomainStatus = 'pending'
  private advance = true
  private changes = 0
  private createdAt = 0
  private checkedAt = 0
  private lapsedAt: number | null = null
  private proofPublished = false

  constructor(
    private readonly pro: () => ProView,
    private readonly tips: () => TipSettings,
  ) {}

  setState(s: DemoTipDomainState): void {
    if (s.hostname !== undefined) {
      this.host = s.hostname
      this.unicode = s.hostname ?? ''
      this.createdAt = Date.now() - 3_600_000
      this.checkedAt = Date.now() - 120_000
      if (s.status === undefined) this.status = 'pending'
    }
    if (s.status !== undefined) this.status = s.status
    if (s.advance !== undefined) this.advance = s.advance
    if (s.changesToday !== undefined) this.changes = s.changesToday
    if (s.proofPublished !== undefined) this.proofPublished = s.proofPublished
    if (s.lapsed !== undefined) this.lapsedAt = s.lapsed ? Date.now() - DAY : null
  }

  private gate(): void {
    const p = this.pro()
    if (!p.active)
      throw new HttpError(
        402,
        'pro_required',
        'This runs on Ferrocast’s servers and is part of Pro.',
        'See Settings › Pro. Everything free in Ferrocast stays free.',
      )
    if (!p.features.tip_domain)
      throw new HttpError(
        503,
        'domains_unavailable',
        'Custom addresses aren’t set up on this relay yet.',
        'Your tip page keeps working at its usual link.',
      )
  }

  private view(): TipDomain {
    const h = this.host
    if (!h)
      throw new HttpError(
        404,
        'not_found',
        'You haven’t added your own address yet.',
        'Add one under Tips › Your own address.',
      )
    const labels = h.split('.')
    const live = this.status === 'live'
    const cf: Record<TipDomainStatus, [string, string]> = {
      pending: ['pending', 'initializing'],
      verifying: ['active', 'pending_validation'],
      live: ['active', 'active'],
      failed: ['pending', 'validation_timed_out'],
      proof_missing: ['active', 'active'],
    }
    const proofName = `_ferrocast.${h}`
    const found = this.status === 'verifying' || this.status === 'live'
    const errors: string[] = []
    if (this.status === 'proof_missing')
      errors.push(
        `The TXT record ${proofName} is gone, so this address stopped showing your tip page. Add it back.`,
      )
    else if (!found && !live) errors.push(`The TXT record ${proofName} isn’t there yet.`)
    if (this.status === 'pending') errors.push('custom hostname does not CNAME to this zone.')
    if (this.status === 'failed') errors.push('The certificate check timed out.')
    return clone({
      hostname: h,
      hostname_unicode: this.unicode || h,
      status: this.status,
      hostname_status: cf[this.status][0],
      ssl_status: cf[this.status][1],
      dns: [{ type: 'CNAME', name: h, host: labels.slice(0, -2).join('.'), target: TARGET }],
      proof: {
        type: 'TXT',
        name: proofName,
        host: `_ferrocast.${labels.slice(0, -2).join('.')}`,
        value: 'ferrocast-proof-8c1f4e07b2d9a356e0f7c41b9a28d6e3',
        found,
      },
      verification: live
        ? []
        : [
            {
              type: 'TXT',
              name: `_cf-custom-hostname.${h}`,
              value: '5cc07c04-ea62-4a5a-95f0-419334a875a4',
              why: 'ownership',
            },
          ],
      errors,
      page_url: `https://${h}`,
      goal_url: `https://${h}/goal`,
      created_at: this.createdAt,
      checked_at: this.checkedAt,
      expires_at: live ? null : this.createdAt + TIP_DOMAIN_LIMITS.unfinishedDays * DAY,
      lapsed_at: this.lapsedAt,
      delete_at: this.lapsedAt === null ? null : this.lapsedAt + TIP_DOMAIN_LIMITS.lapsedDays * DAY,
    })
  }

  private check(): TipDomain {
    this.gate()
    const v = this.view()
    if (this.advance && Date.now() - this.checkedAt >= 1000) {
      this.checkedAt = Date.now()
      if (this.status === 'pending') this.status = 'verifying'
      else if (this.status === 'verifying') this.status = 'live'
      return this.view()
    }
    return v
  }

  private save(body: unknown): Response {
    this.gate()
    const b = requireObj(body)
    if (typeof b.hostname !== 'string') throw new HttpError(400, 'invalid', 'Send { hostname }.')
    const problem = tipDomainProblem(b.hostname)
    if (problem) {
      const apex = problem.startsWith('Use a subdomain')
      throw new HttpError(
        422,
        apex ? 'apex_not_supported' : 'invalid_hostname',
        problem,
        apex
          ? 'A main domain can’t point at another site with a CNAME record; a subdomain can.'
          : 'Use a subdomain you own, like tips.yourchannel.com.',
      )
    }
    const host = normaliseTipDomain(b.hostname) ?? ''
    if (!this.tips().page_url)
      throw new HttpError(
        422,
        'no_tip_page',
        'Create your tip page first.',
        'Your own address shows your tip page, so it needs one.',
      )
    if (this.host === host) return json(200, this.view())
    if (this.host)
      throw new HttpError(
        409,
        'domain_limit',
        `This tip page already uses ${this.host}.`,
        'Remove it first, then add the new address.',
      )
    if (host.startsWith('taken.'))
      throw new HttpError(
        409,
        'domain_taken',
        `${host} is already in use.`,
        'If it’s yours, remove it from the other Ferrocast first, or pick another subdomain.',
      )
    if (host.startsWith('elsewhere.') && !this.proofPublished) {
      const labels = host.split('.')
      return json(409, {
        error: {
          code: 'domain_taken',
          message: 'That address is set up somewhere else on Cloudflare.',
          hint: 'If it’s yours, add the TXT record below where you manage your domain, wait a few minutes, then try again. If it’s on another Cloudflare account or service, remove it there first.',
        },
        proof: {
          type: 'TXT',
          name: `_ferrocast.${host}`,
          host: `_ferrocast.${labels.slice(0, -2).join('.')}`,
          value: 'ferrocast-proof-8c1f4e07b2d9a356e0f7c41b9a28d6e3',
        },
      })
    }
    if (this.changes >= TIP_DOMAIN_LIMITS.changesPerDay)
      throw new HttpError(
        429,
        'tip_domain_quota',
        'That’s enough address changes for today.',
        'It starts again tomorrow (UTC).',
        3600,
      )
    this.changes += 1
    this.host = host
    this.unicode = b.hostname
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/[/.]+$/, '')
      .toLowerCase()
    this.status = 'pending'
    this.createdAt = Date.now()
    this.checkedAt = Date.now()
    this.lapsedAt = null
    return json(201, this.view())
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg.length !== 3 || seg[0] !== 'pro' || seg[1] !== 'tips' || seg[2] !== 'domain')
      return NOT_MINE
    if (method === 'GET') return this.check()
    if (method === 'PUT') return this.save(body)
    if (method === 'DELETE') {
      this.gate()
      this.view()
      this.host = null
      this.changes += 1
      return undefined
    }
    return NOT_MINE
  }
}

function json(status: number, v: unknown): Response {
  return new Response(JSON.stringify(v), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

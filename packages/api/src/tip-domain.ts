// Pro: the tip page on the streamer's own address (API.md §9.2, "Your own address"). The
// relay adds a subdomain the streamer owns (tips.mychannel.com) to Cloudflare for SaaS and
// says which two DNS records to add: a CNAME, and a TXT record that proves this claim. Once
// Cloudflare sees the CNAME, has a certificate and the relay finds the TXT record, the address
// shows the tip page. The check below only catches what's plainly wrong before sending (and
// warns for an obvious bare domain like mychannel.com); the relay judges the rest with the full
// Public Suffix List and its look-alike checks.

import type { FerroClient } from './client'
import { ApiError } from './errors'

/** `pending`: waiting for the DNS records. `verifying`: the records work, the certificate is
 * on its way. `live`: the address shows the tip page. `failed`: Cloudflare gave up.
 * `proof_missing`: it worked, then the TXT record went, so it stopped. */
export type TipDomainStatus = 'pending' | 'verifying' | 'live' | 'failed' | 'proof_missing'

export interface TipDomainDns {
  type: 'CNAME'
  /** The full name (tips.mychannel.com). */
  name: string
  /** What most DNS providers want in their Name box (tips). */
  host: string
  /** Where it points (the tip host). */
  target: string
}

/** The TXT record that proves the address is this streamer's. Required, and it has to stay. */
export interface TipDomainProof {
  type: 'TXT'
  /** _ferrocast.tips.mychannel.com */
  name: string
  /** _ferrocast.tips, for the Name box. */
  host: string
  value: string
  /** The relay found it (and it hasn't gone missing since). */
  found: boolean
}

export interface TipDomainRecord {
  type: 'TXT'
  name: string
  value: string
  /** `ownership`: proves the address is yours before the CNAME works. `certificate`: a TXT
   * certificate check. Both optional with the CNAME in place. */
  why: 'ownership' | 'certificate'
}

/** `GET /api/v1/pro/tips/domain` (404 `not_found` without one). */
export interface TipDomain {
  /** ASCII (international names as punycode). */
  hostname: string
  /** What to show (tips.bücher.de). */
  hostname_unicode: string
  status: TipDomainStatus
  /** Cloudflare's own words, for support. */
  hostname_status: string
  ssl_status: string
  dns: TipDomainDns[]
  proof: TipDomainProof
  verification: TipDomainRecord[]
  /** What's missing (the TXT record first, then Cloudflare's words); empty once live. */
  errors: string[]
  page_url: string
  goal_url: string
  created_at: number
  /** When Cloudflare last answered a check (the relay checks at most once a minute). */
  checked_at: number
  /** Not live: it's removed at this time (7 days after it was added or last worked). */
  expires_at: number | null
  /** Pro ended: the address keeps working until `delete_at`. */
  lapsed_at: number | null
  delete_at: number | null
}

/** The TXT record that would let this PC take over an address Cloudflare already has: sent
 * with a 409 `domain_taken` when the hostname exists but this install's proof isn't
 * published yet. Add it, wait a few minutes, then add the address again. */
export type TipDomainClaimProof = Omit<TipDomainProof, 'found'>

/** The proof carried by a 409 `domain_taken`, or null for any other error. */
export function tipDomainClaimProof(e: unknown): TipDomainClaimProof | null {
  if (!(e instanceof ApiError) || e.status !== 409 || e.code !== 'domain_taken') return null
  const p = (e.body as { proof?: unknown } | null)?.proof
  if (typeof p !== 'object' || p === null) return null
  const { name, host, value } = p as Record<string, unknown>
  if (typeof name !== 'string' || typeof value !== 'string' || !name || !value) return null
  return { type: 'TXT', name, host: typeof host === 'string' && host ? host : name, value }
}

export const TIP_DOMAIN_LIMITS = {
  changesPerDay: 10,
  refreshSeconds: 60,
  /** The panel asks again this often while pending or verifying (and on screen). */
  pollSeconds: 15,
  lapsedDays: 7,
  unfinishedDays: 7,
} as const

const SPECIAL = [
  'localhost',
  'local',
  'internal',
  'test',
  'example',
  'invalid',
  'onion',
  'arpa',
  'lan',
]

/** What the relay will store for a typed address (lowercase, no scheme or trailing dot,
 * international names as punycode), or null when it can't be read. */
export function normaliseTipDomain(raw: string): string | null {
  let s = raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '')
    .replace(/\.$/, '')
  if (!s || /[\s/?#@:\\*[\]]/.test(s)) return null
  try {
    s = new URL(`http://${s}`).hostname
  } catch {
    return null
  }
  return s.toLowerCase()
}

/** The plain reason an address can't be used, before sending it (null: looks fine). */
export function tipDomainProblem(raw: string): string | null {
  const t = raw.trim()
  if (!t) return 'Type the address, like tips.yourchannel.com.'
  if (t.includes('*')) return 'Wildcards (*) aren’t supported. Use one address.'
  const bare = t.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  if (/^\[|^\d{1,3}(\.\d{1,3}){3}$/.test(bare) || bare.includes('::'))
    return 'Use a name, not an IP address.'
  if (/[\s/?#@:\\]/.test(bare)) return 'Type just the address: no port, path or spaces.'
  const name = normaliseTipDomain(t)
  if (!name) return 'That isn’t a valid address. Use letters, numbers and dashes.'
  const labels = name.split('.')
  const ok = (l: string) =>
    l.length >= 1 && l.length <= 63 && /^[a-z0-9-]+$/.test(l) && !/^-|-$/.test(l)
  if (labels.length < 2 || name.length > 253 || !labels.every(ok))
    return 'That isn’t a valid address. Use letters, numbers and dashes.'
  const tld = labels[labels.length - 1] ?? ''
  if (/^\d+$/.test(tld)) return 'Use a name, not an IP address.'
  if (SPECIAL.includes(tld)) return 'That address only works on your own network.'
  if (name === 'clearcraftlabs.com' || name.endsWith('.clearcraftlabs.com'))
    return 'That’s one of Ferrocast’s own addresses. Use one on a domain you own.'
  // Only the obvious bare domain (two parts). Endings like co.uk or github.io are judged by
  // the relay with the whole Public Suffix List.
  if (labels.length === 2) return `Use a subdomain, like tips.${name}.`
  return null
}

/** The status as a short label and a line saying what happens next. */
export function tipDomainStep(d: Pick<TipDomain, 'status'>): { label: string; line: string } {
  switch (d.status) {
    case 'live':
      return { label: 'Live', line: 'Viewers can open it now. Your usual link keeps working too.' }
    case 'verifying':
      return {
        label: 'Verifying certificate',
        line: 'The records work. The certificate usually takes a few minutes.',
      }
    case 'failed':
      return {
        label: 'Not working',
        line: 'Check the records, then remove the address and add it again.',
      }
    case 'proof_missing':
      return {
        label: 'TXT record missing',
        line: 'The TXT record was removed, so this address stopped. Add it back below.',
      }
    default:
      return {
        label: 'Pending',
        line: 'Add both records below. It can take a few minutes to an hour to be seen.',
      }
  }
}

export function tipDomainApi(c: FerroClient) {
  return {
    get: () => c.request<TipDomain>('GET', '/api/v1/pro/tips/domain'),
    save: (hostname: string) =>
      c.request<TipDomain>('PUT', '/api/v1/pro/tips/domain', { hostname }),
    remove: () => c.request<void>('DELETE', '/api/v1/pro/tips/domain'),
  }
}

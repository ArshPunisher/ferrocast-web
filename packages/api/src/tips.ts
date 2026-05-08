// The tip page rules, mirroring the relay's own checks (ferrocast `crates/relay/src/tips.rs`)
// word for word, so the dashboard can say what's wrong before saving and the demo engine
// refuses exactly what the real one does. The relay stays the judge: anything it says
// still reaches the streamer through `describeError`.

import type { TipProviderKey } from './types'

export const TIP_PROVIDER_KEYS: readonly TipProviderKey[] = ['razorpay', 'kofi', 'stripe']

export const TIP_LIMITS = {
  handleMin: 3,
  handleMax: 30,
  displayNameMax: 40,
  messageMax: 280,
  secretMin: 8,
  secretMax: 200,
  pageIdMax: 64,
  handleChangesPerDay: 3,
  holdDays: 30,
} as const

/** The hosts each provider's payment page may live on (a subdomain of one is fine). */
export const TIP_PROVIDER_HOSTS: Record<TipProviderKey, readonly string[]> = {
  razorpay: ['razorpay.me', 'pages.razorpay.com', 'rzp.io'],
  kofi: ['ko-fi.com'],
  stripe: ['buy.stripe.com'],
}

export const TIP_PROVIDER_NAMES: Record<TipProviderKey, string> = {
  razorpay: 'Razorpay',
  kofi: 'Ko-fi',
  stripe: 'Stripe',
}

/** Providers whose webhook carries a Payment Link id the relay can match. */
export const TIP_PAGE_ID_PROVIDERS: readonly TipProviderKey[] = ['razorpay', 'stripe']

/** Words no tip page name may contain: ours, the platforms', and ones that look official. */
export const TIP_RESERVED_WORDS: readonly string[] = [
  'ferrocast',
  'clearcraft',
  'official',
  'twitch',
  'youtube',
  'kick',
  'razorpay',
  'stripe',
  'kofi',
  'ko-fi',
  'admin',
  'support',
  'staff',
  'security',
  'verify',
]

/** Whole names nobody may claim. */
export const TIP_RESERVED_NAMES: readonly string[] = [
  'admin',
  'api',
  'app',
  'billing',
  'clearcraft',
  'clearcraftlabs',
  'contact',
  'ferrocast',
  'help',
  'kick',
  'login',
  'official',
  'pay',
  'payment',
  'razorpay',
  'root',
  'security',
  'settings',
  'staff',
  'stripe',
  'support',
  'test',
  'tip',
  'tips',
  'twitch',
  'verify',
  'youtube',
  'ko-fi',
  'kofi',
]

/** What the relay does to a handle before checking it. */
export function normaliseTipHandle(h: string): string {
  return h.trim().toLowerCase()
}

const BAD_CHARS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001f\u007f-\u009f\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff\u00ad\u061c\u2028\u2029]/g

/**
 * Strips control, zero-width and text-direction characters (a name can't make an alert read
 * backwards or hide text), then trims and caps the length, like the relay's `clean_text`.
 */
export function cleanTipText(s: string, max = Infinity): string {
  return Array.from(s.replace(BAD_CHARS, '').trim()).slice(0, max).join('')
}

/** Counts characters the way the relay does (code points, not UTF-16 units). */
export function tipTextLength(s: string): number {
  return Array.from(s).length
}

export function tipHandleProblem(raw: string): string | null {
  const h = normaliseTipHandle(raw)
  if (
    h.length < TIP_LIMITS.handleMin ||
    h.length > TIP_LIMITS.handleMax ||
    !/^[a-z0-9_-]+$/.test(h)
  )
    return 'The tip page name must be 3 to 30 lowercase letters, numbers, - or _.'
  if (TIP_RESERVED_NAMES.includes(h) || TIP_RESERVED_WORDS.some((w) => h.includes(w)))
    return 'That tip page name is reserved. Pick another.'
  return null
}

export function tipDisplayNameProblem(raw: string): string | null {
  const n = tipTextLength(cleanTipText(raw))
  return n < 1 || n > TIP_LIMITS.displayNameMax
    ? 'The display name must be 1 to 40 characters.'
    : null
}

export function tipMessageProblem(raw: string): string | null {
  return tipTextLength(raw) > TIP_LIMITS.messageMax
    ? 'The tip page message can be up to 280 characters.'
    : null
}

/** The normalised https URL on one of the provider's hosts, or null. */
export function checkedTipPage(key: TipProviderKey, raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return null
  }
  const host = u.hostname
  const ok =
    u.protocol === 'https:' &&
    u.username === '' &&
    u.password === '' &&
    TIP_PROVIDER_HOSTS[key].some((h) => host === h || host.endsWith(`.${h}`))
  return ok ? u.toString() : null
}

export function tipLinkProblem(key: TipProviderKey, raw: string): string | null {
  return checkedTipPage(key, raw)
    ? null
    : `The ${TIP_PROVIDER_NAMES[key]} link must be an https link on ${TIP_PROVIDER_HOSTS[key].join(' or ')}.`
}

/**
 * Problems with a secret being saved. `hasSaved` says one is already stored, so a blank
 * field keeps it.
 */
export function tipSecretProblem(
  key: TipProviderKey,
  raw: string,
  hasSaved: boolean,
): string | null {
  const name = TIP_PROVIDER_NAMES[key]
  const s = raw.trim()
  if (s === '')
    return hasSaved ? null : `Add the ${name} webhook secret so payments can be checked.`
  if (s.length > TIP_LIMITS.secretMax)
    return `That ${name} secret is too long to be a webhook secret.`
  if (key === 'stripe') {
    if (['sk_', 'rk_', 'pk_'].some((p) => s.startsWith(p)))
      return 'That’s a Stripe API key. Paste the webhook signing secret instead (it starts with whsec_), and if you shared a live key anywhere, roll it in the Stripe dashboard.'
    if (!s.startsWith('whsec_'))
      return 'The Stripe webhook signing secret starts with whsec_. Copy it from the webhook’s page.'
  } else if (s.length < TIP_LIMITS.secretMin) {
    return `The ${name} webhook secret is too short. Use at least 8 characters.`
  }
  return null
}

export function tipPageIdProblem(
  key: TipProviderKey,
  raw: string | null | undefined,
): string | null {
  const id = (raw ?? '').trim()
  if (id === '') return null
  const ok =
    TIP_PAGE_ID_PROVIDERS.includes(key) &&
    id.startsWith('plink_') &&
    id.length <= TIP_LIMITS.pageIdMax &&
    /^[A-Za-z0-9_]+$/.test(id)
  return ok
    ? null
    : `The ${TIP_PROVIDER_NAMES[key]} link id must be a Payment Link id that starts with plink_ (or leave it empty).`
}

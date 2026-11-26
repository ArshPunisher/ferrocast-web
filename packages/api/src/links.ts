import type { Account, CreatorLinks, CustomLink, ResolvedLinks } from './types'

export const MAX_LINK_CHARS = 120
export const MAX_LABEL_CHARS = 40
export const MAX_CUSTOM_LINKS = 6

export const SAMPLE_LINKS: ResolvedLinks = {
  twitch: 'twitch.tv/novaplays',
  youtube: 'youtube.com/@novaplays',
  kick: 'kick.com/novaplays',
  facebook: null,
  discord: 'discord.gg/novaplays',
  instagram: 'instagram.com/novaplays',
  x: 'x.com/novaplays',
  tiktok: 'tiktok.com/@novaplays',
  website: 'novaplays.gg',
  custom: [],
  socials: [
    'twitch.tv/novaplays',
    'youtube.com/@novaplays',
    'kick.com/novaplays',
    'discord.gg/novaplays',
  ],
  channel_name: 'NovaPlays',
  next_stream: 'Friday, 8 PM',
  next_stream_at: null,
}

type LinkFieldKey =
  | 'twitch'
  | 'youtube'
  | 'kick'
  | 'facebook'
  | 'discord'
  | 'instagram'
  | 'x'
  | 'tiktok'
  | 'website'

function hasControlChar(raw: string): boolean {
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true
  }
  return false
}

function hasUnsafeScheme(raw: string): boolean {
  const compact = raw.replace(/\s+/g, '').toLowerCase()
  const stripped = compact.replace(/^https?:\/\//i, '')
  for (const candidate of [compact, stripped]) {
    if (
      candidate.startsWith('javascript:') ||
      candidate.startsWith('vbscript:') ||
      candidate.startsWith('data:')
    )
      return true
  }
  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(compact)
  if (schemeMatch && schemeMatch[1] !== 'http' && schemeMatch[1] !== 'https') return true
  return false
}

function checkField(field: string, raw: string, maxChars: number): string | null {
  if (hasControlChar(raw)) throw new Error(`${field}: control characters are not allowed.`)
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (Array.from(trimmed).length > maxChars)
    throw new Error(`${field}: must be at most ${maxChars} characters.`)
  if (hasUnsafeScheme(trimmed))
    throw new Error(`${field}: javascript: and unsafe link schemes are not allowed.`)
  return trimmed
}

function checkOpt(field: string, raw: string | null | undefined, maxChars: number): string | null {
  if (raw == null) return null
  return checkField(field, String(raw), maxChars)
}

/** Validates writable "My links" fields identically to `crates/core/src/links.rs`. */
export function validateCreatorLinks(input: CreatorLinks): CreatorLinks {
  const rawCustom = Array.isArray(input.custom) ? input.custom : []
  if (rawCustom.length > MAX_CUSTOM_LINKS)
    throw new Error(`custom: add at most ${MAX_CUSTOM_LINKS} custom links.`)
  const custom: CustomLink[] = []
  for (let i = 0; i < rawCustom.length; i++) {
    const row = rawCustom[i]!
    const label = checkField(`custom.${i}.label`, String(row.label ?? ''), MAX_LABEL_CHARS)
    const value = checkField(`custom.${i}.value`, String(row.value ?? ''), MAX_LINK_CHARS)
    if (label === null && value === null) continue
    if (label === null) throw new Error(`custom.${i}.label: enter a label.`)
    if (value === null) throw new Error(`custom.${i}.value: enter a link or handle.`)
    custom.push({ label, value })
  }
  return {
    twitch: checkOpt('twitch', input.twitch, MAX_LINK_CHARS),
    youtube: checkOpt('youtube', input.youtube, MAX_LINK_CHARS),
    kick: checkOpt('kick', input.kick, MAX_LINK_CHARS),
    facebook: checkOpt('facebook', input.facebook, MAX_LINK_CHARS),
    discord: checkOpt('discord', input.discord, MAX_LINK_CHARS),
    instagram: checkOpt('instagram', input.instagram, MAX_LINK_CHARS),
    x: checkOpt('x', input.x, MAX_LINK_CHARS),
    tiktok: checkOpt('tiktok', input.tiktok, MAX_LINK_CHARS),
    website: checkOpt('website', input.website, MAX_LINK_CHARS),
    schedule_text: checkOpt('schedule_text', input.schedule_text, MAX_LINK_CHARS),
    custom,
  }
}

export function accountUrl(platform: string, login: string, userId = ''): string | null {
  const cleanLogin = login.trim()
  const cleanId = userId.trim()
  switch (platform) {
    case 'twitch': {
      const h = cleanLogin.replace(/^@+/, '')
      return h && !/\s/.test(h) ? `twitch.tv/${h.toLowerCase()}` : null
    }
    case 'youtube': {
      if (cleanLogin.startsWith('@') && cleanLogin.length > 1 && !/\s/.test(cleanLogin))
        return `youtube.com/${cleanLogin}`
      if (cleanId && !/\s/.test(cleanId)) return `youtube.com/channel/${cleanId}`
      return null
    }
    case 'kick': {
      const h = cleanLogin.replace(/^@+/, '')
      return h && !/\s/.test(h) ? `kick.com/${h}` : null
    }
    default:
      return null
  }
}

function stripUrlNoise(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
}

export function normalizeDisplayLink(kind: LinkFieldKey | 'custom', raw: string): string | null {
  if (hasControlChar(raw) || hasUnsafeScheme(raw)) return null
  const clean = stripUrlNoise(raw)
  if (!clean) return null
  if (clean.includes('/')) return clean
  const bare = clean.replace(/^@+/, '')
  switch (kind) {
    case 'twitch':
      return bare ? `twitch.tv/${bare.toLowerCase()}` : null
    case 'youtube':
      return clean.startsWith('@') ? `youtube.com/${clean}` : `youtube.com/@${clean}`
    case 'kick':
      return bare ? `kick.com/${bare}` : null
    case 'facebook':
      return bare ? `facebook.com/${bare}` : null
    case 'discord':
      return bare ? `discord.gg/${bare}` : null
    case 'instagram':
      return bare ? `instagram.com/${bare}` : null
    case 'x':
      return bare ? `x.com/${bare}` : null
    case 'tiktok':
      return bare ? `tiktok.com/@${bare}` : null
    default:
      return clean
  }
}

export function formatScheduleTime(ms: number): string {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(d)
  const time = new Intl.DateTimeFormat(
    'en-US',
    d.getMinutes() === 0
      ? { hour: 'numeric', hour12: true }
      : { hour: 'numeric', minute: '2-digit', hour12: true },
  ).format(d)
  return `${day}, ${time}`
}

export function resolveLinks(
  links: CreatorLinks,
  accounts: readonly Pick<Account, 'platform' | 'name' | 'login' | 'url'>[],
  nextStreamAt: number | null = null,
): ResolvedLinks {
  const fromPlatform = (p: 'twitch' | 'youtube' | 'kick' | 'facebook'): string | null => {
    const ov = links[p]
    if (ov) {
      const n = normalizeDisplayLink(p, ov)
      if (n) return n
    }
    const acct = accounts.find((a) => a.platform === p)
    if (!acct) return null
    if (acct.url !== undefined) return acct.url
    return accountUrl(p, acct.login ?? '', '')
  }

  const twitch = fromPlatform('twitch')
  const youtube = fromPlatform('youtube')
  const kick = fromPlatform('kick')
  const facebook = fromPlatform('facebook')
  const discord = links.discord ? normalizeDisplayLink('discord', links.discord) : null
  const instagram = links.instagram ? normalizeDisplayLink('instagram', links.instagram) : null
  const x = links.x ? normalizeDisplayLink('x', links.x) : null
  const tiktok = links.tiktok ? normalizeDisplayLink('tiktok', links.tiktok) : null
  const website = links.website ? normalizeDisplayLink('website', links.website) : null

  const custom: CustomLink[] = []
  for (const row of links.custom ?? []) {
    const label = row.label.trim()
    const value = normalizeDisplayLink('custom', row.value)
    if (label && value) custom.push({ label, value })
  }

  const socials: string[] = []
  for (const v of [twitch, youtube, kick, facebook, discord, instagram, x, tiktok, website]) {
    if (v) socials.push(v)
  }
  for (const c of custom) socials.push(`${c.label}: ${c.value}`)

  const priority = ['twitch', 'youtube', 'kick', 'facebook'] as const
  let channel_name: string | null = null
  for (const p of priority) {
    const acct = accounts.find((a) => a.platform === p)
    const n = acct?.name?.trim() || acct?.login?.trim()
    if (n) {
      channel_name = n
      break
    }
  }

  const next_stream =
    nextStreamAt != null
      ? formatScheduleTime(nextStreamAt)
      : links.schedule_text?.trim() || null

  return {
    twitch,
    youtube,
    kick,
    facebook,
    discord,
    instagram,
    x,
    tiktok,
    website,
    custom,
    socials,
    channel_name,
    next_stream,
    next_stream_at: nextStreamAt,
  }
}

export function hasConfiguredLinks(links: ResolvedLinks | null | undefined): boolean {
  if (!links) return false
  return Boolean(
    links.socials.length > 0 ||
      links.channel_name ||
      links.next_stream ||
      links.next_stream_at != null,
  )
}

/** Normalized display schedule string (`next_stream_at` uses the viewer/host's local timezone). */
export function resolveNextStream(links: ResolvedLinks | null | undefined): string {
  if (!links) return ''
  if (typeof links.next_stream_at === 'number' && Number.isFinite(links.next_stream_at)) {
    return formatScheduleTime(links.next_stream_at) || links.next_stream || ''
  }
  return links.next_stream?.trim() ?? ''
}

const TOKEN_OR_PLACEHOLDER_RE =
  /\{(?:link:(?:twitch|youtube|kick|facebook|discord|instagram|x|tiktok|website)|socials|channel_name|next_stream)\}|yourname|Next stream:\s*Friday,\s*8\s*PM/i

function handleFromLink(url: string): string {
  const clean = stripUrlNoise(url)
  const slash = clean.indexOf('/')
  const tail = slash >= 0 ? clean.slice(slash + 1) : clean
  if (tail.startsWith('channel/')) return clean
  return tail.replace(/^@+/, '')
}

function inferLegacyKey(before: string): LinkFieldKey | 'channel_name' {
  const b = before.toLowerCase()
  if (b.includes('twitch')) return 'twitch'
  if (b.includes('youtube')) return 'youtube'
  if (b.includes('kick')) return 'kick'
  if (b.includes('discord') || b.includes('gg/')) return 'discord'
  if (b.includes('insta')) return 'instagram'
  if (b.includes('tiktok')) return 'tiktok'
  if (b.includes('facebook') || b.includes('fb')) return 'facebook'
  if (/\bx\b/.test(b) || b.includes('x.com')) return 'x'
  return 'channel_name'
}

function legacyReplacement(urlOrName: string, before: string, upper: boolean): string {
  let out = urlOrName.includes('/') ? handleFromLink(urlOrName) : urlOrName.trim()
  if (out.startsWith('@') && before.endsWith('@')) out = out.slice(1)
  return upper ? out.toUpperCase() : out
}

function resolveSource(
  links: ResolvedLinks | null | undefined,
  preview: boolean,
): ResolvedLinks {
  if (!links || (preview && !hasConfiguredLinks(links))) return preview ? SAMPLE_LINKS : EMPTY_LINKS
  return links
}

const EMPTY_LINKS: ResolvedLinks = {
  twitch: null,
  youtube: null,
  kick: null,
  facebook: null,
  discord: null,
  instagram: null,
  x: null,
  tiktok: null,
  website: null,
  custom: [],
  socials: [],
  channel_name: null,
  next_stream: null,
  next_stream_at: null,
}

/** Resolves tokens and legacy placeholders in a single text line. Hand-edited plain text is never altered. */
export function resolveLayerText(
  text: string,
  links: ResolvedLinks | null | undefined,
  preview: boolean,
): string {
  if (!TOKEN_OR_PLACEHOLDER_RE.test(text)) return text
  const src = resolveSource(links, preview)
  const nextVal = resolveNextStream(src)

  // Legacy ending-screen phrasing resolves via `{next_stream}` cleanly (dropped when unconfigured).
  if (/^\s*Next stream:\s*Friday,\s*8\s*PM\s*$/i.test(text)) {
    const colon = text.indexOf(':')
    const prefix = colon >= 0 ? text.slice(0, colon + 1) : 'Next stream:'
    if (!nextVal) return ''
    return /^next stream:/i.test(nextVal) ? nextVal : `${prefix.trimStart()} ${nextVal}`
  }

  let out = text
  let hadMissing = false

  // Handle `{socials}` token.
  if (out.includes('{socials}')) {
    const joined = src.socials.join(' · ')
    if (!joined) hadMissing = true
    out = out.replaceAll('{socials}', joined)
  }

  // Handle `{next_stream}` token, avoiding "Next stream: " dangling or double-prefixed output.
  if (/^\s*next stream:\s*\{next_stream\}\s*$/i.test(out)) {
    if (!nextVal) return ''
    const colon = out.indexOf(':')
    const prefix = out.slice(0, colon + 1).trimStart()
    return /^next stream:/i.test(nextVal) ? nextVal : `${prefix} ${nextVal}`
  }
  out = out.replace(/\{next_stream\}/g, () => {
    if (!nextVal) {
      hadMissing = true
      return ''
    }
    return nextVal
  })

  out = out.replace(/\{channel_name\}/g, () => {
    const name = src.channel_name?.trim() ?? ''
    if (!name) {
      hadMissing = true
      return ''
    }
    return name
  })

  out = out.replace(
    /\{link:(twitch|youtube|kick|facebook|discord|instagram|x|tiktok|website)\}/g,
    (_, k: LinkFieldKey) => {
      const v = src[k]?.trim() ?? ''
      if (!v) {
        hadMissing = true
        return ''
      }
      return v
    },
  )

  out = out.replace(/(?:youtube(?:\.com)?\s*\/?\s*@?)?yourname/gi, (match, offset: number, full: string) => {
    if (match.toLowerCase() === 'yourname') {
      const before = full.slice(0, offset)
      const key = inferLegacyKey(before)
      const raw = key === 'channel_name' ? (src.channel_name ?? src.socials[0] ?? '') : (src[key] ?? '')
      if (!raw) {
        hadMissing = true
        return ''
      }
      if (/youtube(?:\.com)?\/@$/i.test(before) && raw.includes('/channel/')) return raw.replace(/^youtube(?:\.com)?\//i, '')
      return legacyReplacement(raw, before, match === 'YOURNAME')
    }
    const raw = src.youtube?.trim() ?? ''
    if (!raw) {
      hadMissing = true
      return ''
    }
    if (raw.includes('/channel/')) return raw
    const before = full.slice(0, offset)
    const upper = match.endsWith('YOURNAME')
    const handle = legacyReplacement(raw, match.slice(0, -'yourname'.length), upper)
    const prefix = match.slice(0, -'yourname'.length)
    return prefix.endsWith('@') || prefix.endsWith('/') || !prefix ? `${before ? '' : ''}${prefix}${handle}` : `${prefix}@${handle}`
  })

  if (hadMissing) return ''
  return out
}

/** Resolves text and `rotate` arrays for `LayerWidget`, dropping unconfigured entries in live mode. */
export function resolveLayerItems(
  primaryText: string,
  rotate: readonly string[] | undefined,
  links: ResolvedLinks | null | undefined,
  preview: boolean,
): string[] {
  const src = resolveSource(links, preview)
  const raw = rotate && rotate.length > 0 ? [primaryText, ...rotate] : [primaryText]
  const out: string[] = []
  for (const item of raw) {
    if (!item.trim()) continue
    if (item.trim() === '{socials}') {
      for (const s of src.socials) out.push(s)
      continue
    }
    const resolved = resolveLayerText(item, links, preview)
    if (resolved !== '') out.push(resolved)
  }
  return out
}

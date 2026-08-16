// StreamElements and Streamlabs importers in the demo, matching the engine
// (`crates/engine/src/import`, `crates/store/src/import.rs`): the same two steps (preview,
// then apply), the same checks and error codes, and a realistic sample channel. Commands and
// timers really land in the demo's Bot screen; points are only counted.
//
// Demo tokens: any JWT-shaped text works. One containing "expired" plays a rejected token,
// "down" a StreamElements outage, "slow" a rate limit.

import type {
  Command,
  ConflictChoice,
  ImportItem,
  ImportPreview,
  ImportPreviewSection,
  ImportReport,
  ImportSource,
  NotImported,
  Timer,
} from '../../types'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type Routed } from './host'

/** A made-up JWT for trying the importer in the demo. */
export const DEMO_SE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjaGFubmVsIjoiZGVtbyJ9.ZGVtby1zaWduYXR1cmUtbm90LXJlYWw'

const WHERE =
  'Copy a fresh JWT from StreamElements → Account → Channels → Show secrets (JWT Token), then paste it here.'
export const MAX_FILE = 10 * 1024 * 1024
/** Same words as the engine (`NEEDS_MATCH_REASON`). */
export const NEEDS_MATCH_REASON =
  'YouTube names aren’t unique and this list has no channel id, so Ferrocast won’t pay it automatically. Add their points by hand from their viewer card once they chat.'
const TTL = 30 * 60 * 1000

type Cmd = Omit<Command, 'id'>
type Tmr = Omit<Timer, 'id'>

interface Held {
  id: string
  source: ImportSource
  commands: Cmd[]
  timers: Tmr[]
  /** Whose viewers the points are; YouTube names alone are never paid automatically. */
  platform: 'twitch' | 'youtube' | 'kick' | null
  points: { name: string; user_id?: string; points: number }[]
  tips: number
  mappedSkips: { kind: ImportPreviewSection['kind']; item: ImportItem }[]
  notes: { kind: ImportPreviewSection['kind']; text: string }[]
  kinds: ImportPreviewSection['kind'][]
  loyalty: boolean
  not_imported: NotImported[]
  account: ImportPreview['account']
  expires_at: number
}

const cmd = (name: string, response: string, extra: Partial<Cmd> = {}): Cmd => ({
  name,
  aliases: [],
  response,
  roles: 'everyone',
  cooldown_s: 5,
  user_cooldown_s: 15,
  platforms: [],
  enabled: true,
  ...extra,
})

const tmr = (name: string, message: string, every: number, lines: number): Tmr => ({
  name,
  message,
  every_min: every,
  min_chat_lines: lines,
  platforms: [],
  enabled: true,
})

/** What the sample StreamElements channel has. */
function sampleChannel(): Omit<Held, 'id' | 'expires_at'> {
  const viewers = [
    'mira_plays',
    'Kestrel',
    'ohno_its_ben',
    'TacoTuesday',
    'loafcat',
    'nightbot',
    'quietfern',
    'PixelPilgrim',
  ]
  return {
    source: 'streamelements',
    account: { name: 'NovaPlays', platform: 'twitch' },
    platform: 'twitch',
    kinds: ['commands', 'timers', 'points', 'loyalty_settings', 'tips'],
    commands: [
      cmd('!discord', 'Join the Discord, {user}: discord.gg/novaplays', { aliases: ['!dc'] }),
      cmd('!socials', 'Find me everywhere: novaplays.example/links'),
      cmd('!lurk', '{user} is lurking. Enjoy the stream!', { cooldown_s: 0 }),
      cmd('!specs', 'Ryzen 7 7800X3D, RTX 4070, 32 GB RAM.'),
      cmd('!so', 'Go follow {target}!', { roles: 'mods' }),
      cmd('!hug', 'Hugs ${{random.chatter}}!', { enabled: false }),
      cmd('!schedule', 'Live Mon, Wed and Fri at 8 pm IST.'),
    ],
    timers: [
      tmr('socials', 'Follow me everywhere: novaplays.example/links', 20, 5),
      tmr('hydrate', 'Drink some water, chat!', 45, 10),
    ],
    points: viewers.map((name, i) => ({
      name,
      points: [4820, 1250, 990, 640, 410, 75, 300, 0][i] ?? 0,
    })),
    tips: 38,
    loyalty: true,
    mappedSkips: [
      {
        kind: 'commands',
        item: {
          name: '!song request',
          reason: 'Ferrocast command names are one word of letters, numbers, - and _ (up to 32).',
        },
      },
      {
        kind: 'tips',
        item: {
          name: 'Refunded tip',
          reason: 'Its status on StreamElements is "refunded", not a completed payment.',
        },
      },
    ],
    notes: [
      {
        kind: 'commands',
        text: '!hug is turned off: it uses ${random.chatter} which Ferrocast doesn’t have. Check its reply, then turn it on.',
      },
      {
        kind: 'commands',
        text: 'Regulars-only commands became VIP-only: Ferrocast has no regulars list.',
      },
      {
        kind: 'timers',
        text: 'socials: only the first of its 2 messages came over (a Ferrocast timer posts one message).',
      },
      {
        kind: 'loyalty_settings',
        text: 'StreamElements pays every 10 minutes to everyone watching; Ferrocast pays the same amount every 10 minutes to people who chatted.',
      },
    ],
    not_imported: [
      {
        what: 'Overlays and their widgets',
        count: 3,
        reason:
          'StreamElements overlays run on StreamElements’ own code, including custom HTML and JavaScript widgets, which Ferrocast can’t run. Build them again in Overlays; your alert sounds and images can be uploaded there.',
      },
      {
        what: 'Loyalty store items',
        count: 4,
        reason: 'Ferrocast has no points store yet. Viewers can spend points on giveaway entries.',
      },
    ],
  }
}

const STREAMLABS_NOT_IMPORTED: NotImported[] = [
  {
    what: 'Commands and timers',
    count: 0,
    reason:
      'Streamlabs has no export for Cloudbot commands or timers, and Streamlabs Chatbot’s command files use a private format. Add them in Bot; Add starter commands gives you the common ones in one click.',
  },
  {
    what: 'Alerts, widgets and overlays',
    count: 0,
    reason:
      'Streamlabs widgets run on Streamlabs’ servers and can’t be exported. Build them again in Overlays and Alerts.',
  },
]

function checkToken(raw: unknown): string {
  if (typeof raw !== 'string')
    throw new HttpError(400, 'invalid', 'A field is missing or wrong: token is required.')
  const t = raw
    .trim()
    .replace(/^bearer\s+/i, '')
    .trim()
  const parts = t.split('.')
  const ok =
    t.length >= 20 &&
    t.length <= 8192 &&
    parts.length === 3 &&
    parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))
  if (!ok)
    throw new HttpError(
      400,
      'invalid',
      `token: that doesn’t look like a StreamElements JWT (it’s long, with two dots in it). ${WHERE}`,
    )
  return t
}

/** Rows of a CSV (comma, semicolon or tab), enough for the demo's checks. */
function csvRows(text: string): string[][] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
  const first = lines[0] ?? ''
  const delim =
    [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0] ?? ','
  return lines.map((l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, '')))
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '')

async function readTable(label: string, file: Blob): Promise<string[][]> {
  if (file.size > MAX_FILE)
    throw new HttpError(
      413,
      'too_large',
      `The ${label} is too big: each file can be up to 10 MB.`,
      'Export only the columns you need, or split the file, then try again.',
    )
  if (file.size === 0)
    throw new HttpError(
      422,
      'bad_file',
      `${label}: the file is empty.`,
      'Export it again from Streamlabs, then pick it.',
    )
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const isZip = head[0] === 0x50 && head[1] === 0x4b
  if (isZip) {
    // The demo can't open workbooks; the engine can. Treat it as a small sample.
    return [
      ['Name', 'Rank', 'Points', 'Hours'],
      ['mira_plays', 'Viewer', '2100', '40'],
      ['Kestrel', 'Regular', '880', '19'],
    ]
  }
  const text = await file.text()
  if (/[\0\uFFFD]/.test(text) || /^\s*(<|\{|%PDF)/.test(text))
    throw new HttpError(
      415,
      'unsupported_type',
      `The ${label} isn’t a text or spreadsheet file. Use a CSV file or an Excel .xlsx workbook.`,
      'In Excel or Google Sheets, use File → Save as (or Download) → CSV, then pick that file.',
    )
  return csvRows(text)
}

function need(label: string, header: string[], what: string, names: string[]): number {
  const h = header.map(norm)
  for (const n of names) {
    const i = h.indexOf(n)
    if (i >= 0) return i
  }
  throw new HttpError(
    422,
    'bad_file',
    `${label}: there’s no column for ${what}. The first row should name it, for example ${names
      .slice(0, 3)
      .map((n) => `"${n}"`)
      .join(' or ')}. Found: ${header.join(', ') || 'nothing'}.`,
    'Open the file and check its first row names the columns, like Name and Points.',
  )
}

export class DemoImporters {
  private held: Held | null = null

  constructor(
    private readonly commands: () => Command[],
    private readonly setCommands: (c: Command[]) => void,
    private readonly timers: () => Timer[],
    private readonly setTimers: (t: Timer[]) => void,
    private readonly knownNames: () => string[],
  ) {}

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'import' || method !== 'POST' || seg.length < 2) return NOT_MINE
    if (seg[1] === 'streamelements' && seg[2] === 'preview' && seg.length === 3)
      return this.previewSE(body)
    if (seg[1] === 'streamlabs' && seg[2] === 'preview' && seg.length === 3)
      return this.previewSL(body)
    if (seg[1] === 'apply' && seg.length === 2) return this.apply(body)
    return NOT_MINE
  }

  private previewSE(body: unknown): ImportPreview {
    const token = checkToken(requireObj(body).token)
    if (token.includes('expired'))
      throw new HttpError(
        401,
        'streamelements_token_rejected',
        'StreamElements didn’t accept that token. It may have expired, or it isn’t the JWT token.',
        WHERE,
      )
    if (token.includes('down'))
      throw new HttpError(
        502,
        'streamelements_unavailable',
        'StreamElements had a problem (HTTP 503). Nothing was imported.',
        'Try again in a few minutes. If it keeps happening, check status.streamelements.com.',
      )
    if (token.includes('slow'))
      throw new HttpError(
        429,
        'streamelements_rate_limited',
        'StreamElements is limiting requests right now. Try again in 30 seconds.',
        'Nothing was imported. Wait a moment, then run the preview again.',
        30,
      )
    return this.hold(sampleChannel())
  }

  private async previewSL(body: unknown): Promise<ImportPreview> {
    if (!(body instanceof FormData))
      throw new HttpError(
        400,
        'invalid',
        'points: attach your Streamlabs Chatbot points export, a tips export, or both.',
      )
    const platform = body.get('platform')
    const points = body.get('points')
    const tips = body.get('tips')
    const hasPoints = points instanceof Blob
    const hasTips = tips instanceof Blob
    if (!hasPoints && !hasTips)
      throw new HttpError(
        400,
        'invalid',
        'points: attach your Streamlabs Chatbot points export, a tips export, or both.',
      )
    if (platform !== null && !['twitch', 'youtube', 'kick'].includes(String(platform)))
      throw new HttpError(
        400,
        'invalid',
        `platform: "${String(platform)}" isn't a platform; use twitch, youtube or kick.`,
      )
    if (hasPoints && platform === null)
      throw new HttpError(
        400,
        'invalid',
        'platform: say which platform these points are from (twitch, youtube or kick).',
      )
    const held: Omit<Held, 'id' | 'expires_at'> = {
      source: 'streamlabs',
      account: null,
      platform: platform === null ? null : (String(platform) as 'twitch' | 'youtube' | 'kick'),
      kinds: [],
      commands: [],
      timers: [],
      points: [],
      tips: 0,
      loyalty: false,
      mappedSkips: [],
      notes: [],
      not_imported: STREAMLABS_NOT_IMPORTED,
    }
    if (hasPoints) {
      held.kinds.push('points')
      const label = 'points file'
      const rows = await readTable(label, points)
      const [header = [], ...rest] = rows
      const n = need(label, header, 'the viewer’s name', [
        'name',
        'username',
        'user',
        'viewer',
        'displayname',
        'login',
      ])
      const idCol = header
        .map(norm)
        .findIndex((h) =>
          ['userid', 'channelid', 'providerid', 'twitchid', 'youtubeid', 'kickid', 'id'].includes(
            h,
          ),
        )
      const p = need(label, header, 'points', [
        'points',
        'currency',
        'balance',
        'loyaltypoints',
        'amount',
      ])
      rest.forEach((row, i) => {
        const name = row[n] ?? ''
        const raw = row[p] ?? ''
        const val = Number(raw.replace(/[ ,_']/g, ''))
        if (!name)
          throw new HttpError(
            422,
            'bad_file',
            `${label}: row ${i + 2} has no name in the "${header[n]}" column.`,
            'Fill it in or delete that row, then try again.',
          )
        if (!Number.isInteger(val) || val < 0)
          throw new HttpError(
            422,
            'bad_file',
            `${label}: row ${i + 2}, column "${header[p]}": "${raw}" isn’t a whole number of points (0 or more).`,
            'Fix that cell, then try again.',
          )
        const id = idCol >= 0 ? (row[idCol] ?? '') : ''
        held.points.push(id ? { name, user_id: id, points: val } : { name, points: val })
      })
    }
    if (hasTips) {
      held.kinds.push('tips')
      const label = 'tips file'
      const rows = await readTable(label, tips)
      const [header = [], ...rest] = rows
      need(label, header, 'the date', ['date', 'createdat', 'time', 'timestamp', 'datetime'])
      need(label, header, 'the tipper’s name', [
        'name',
        'donor',
        'from',
        'username',
        'user',
        'donatorname',
      ])
      need(label, header, 'the amount', ['amount', 'donation', 'value', 'total'])
      need(label, header, 'the currency', ['currency', 'currencycode'])
      held.tips = rest.length
    }
    return this.hold(held)
  }

  private hold(h: Omit<Held, 'id' | 'expires_at'>): ImportPreview {
    const id = Math.random().toString(16).slice(2).padEnd(12, '0')
    this.held = { ...h, id, expires_at: Date.now() + TTL }
    return { ...this.compute(this.held, 'keep', false).preview, preview_id: id }
  }

  private apply(body: unknown): ImportReport {
    const b = requireObj(body)
    if (b.on_conflict !== 'keep' && b.on_conflict !== 'replace')
      throw new HttpError(
        400,
        'invalid',
        'A field is missing or wrong: on_conflict must be "keep" or "replace".',
      )
    const h = this.held
    if (!h || h.id !== b.preview_id || h.expires_at < Date.now())
      throw new HttpError(
        404,
        'preview_expired',
        'That preview has expired or was replaced by a newer one.',
        'Run the preview again, then import.',
      )
    const r = this.compute(h, b.on_conflict, true)
    this.held = null
    return r.report
  }

  /** Same walk for preview and apply, like the engine. */
  private compute(h: Held, choice: ConflictChoice, write: boolean) {
    const commands = clone(this.commands())
    const timers = clone(this.timers())
    const known = new Set(this.knownNames().map((n) => n.toLowerCase()))
    const sections = h.kinds.map((kind) => {
      const t = {
        kind,
        found: 0,
        new: 0,
        conflicts: 0,
        replaced: 0,
        kept: 0,
        waiting: 0,
        needs_match: 0,
        needs_match_items: [] as ImportItem[],
        skipped: 0,
        conflict_items: [] as ImportItem[],
        skipped_items: [] as ImportItem[],
        notes: h.notes.filter((n) => n.kind === kind).map((n) => n.text),
      }
      const skip = (name: string, reason: string) => {
        t.skipped++
        if (t.skipped_items.length < 100) t.skipped_items.push({ name, reason })
      }
      const clash = (name: string, reason: string): boolean => {
        t.conflicts++
        if (t.conflict_items.length < 100) t.conflict_items.push({ name, reason })
        if (choice === 'keep') t.kept++
        else t.replaced++
        return choice === 'replace'
      }
      for (const s of h.mappedSkips.filter((m) => m.kind === kind)) {
        t.found++
        skip(s.item.name, s.item.reason)
      }
      if (kind === 'commands')
        for (const c of h.commands) {
          t.found++
          const i = commands.findIndex((o) =>
            [o.name, ...o.aliases].some((n) => n.toLowerCase() === c.name.toLowerCase()),
          )
          if (i >= 0) {
            const ex = commands[i]
            if (!ex || !clash(c.name, `You already have ${ex.name} in Ferrocast.`)) continue
            commands[i] = { ...c, id: ex.id, platforms: ex.platforms }
          } else {
            t.new++
            commands.push({ ...c, id: `c-${Math.random().toString(16).slice(2, 10)}` })
          }
        }
      if (kind === 'timers')
        for (const tm of h.timers) {
          t.found++
          const i = timers.findIndex((o) => o.name.toLowerCase() === tm.name.toLowerCase())
          if (i >= 0) {
            const ex = timers[i]
            if (!ex || !clash(tm.name, `You already have a timer called ${ex.name}.`)) continue
            timers[i] = { ...tm, id: ex.id }
          } else {
            t.new++
            timers.push({ ...tm, id: `t-${Math.random().toString(16).slice(2, 10)}` })
          }
        }
      if (kind === 'points')
        for (const p of h.points) {
          t.found++
          if (p.name.toLowerCase() === 'nightbot')
            skip(p.name, 'A chat bot; bots don’t earn points in Ferrocast.')
          else if (p.points === 0)
            skip(p.name, 'They have 0 points, so there’s nothing to bring over.')
          else if (h.platform === 'youtube' && !p.user_id) {
            t.needs_match++
            if (t.needs_match_items.length < 100)
              t.needs_match_items.push({
                name: `${p.name} (${p.points.toLocaleString('en-US')})`,
                reason: NEEDS_MATCH_REASON,
              })
          } else if (h.platform !== 'youtube' && known.has(p.name.toLowerCase())) {
            if (p.name.toLowerCase() === 'mira_plays')
              clash(
                p.name,
                `Ferrocast has 1,120, ${h.source === 'streamelements' ? 'StreamElements' : 'Streamlabs'} has ${p.points.toLocaleString('en-US')}.`,
              )
            else t.new++
          } else t.waiting++
        }
      if (kind === 'loyalty_settings' && h.loyalty) {
        t.found++
        clash(
          'Points settings',
          'You’ve already set up points in Ferrocast ("points", 10 every 5 minutes); StreamElements uses "coins", 5 every 10 minutes.',
        )
      }
      if (kind === 'tips') {
        t.found += h.tips
        t.new += h.tips
      }
      return t
    })
    if (write) {
      this.setCommands(commands)
      this.setTimers(timers)
    }
    const preview: Omit<ImportPreview, 'preview_id'> = {
      source: h.source,
      expires_at: h.expires_at,
      account: h.account,
      sections: sections.map(({ replaced: _r, kept: _k, ...s }) => s),
      not_imported: h.not_imported,
    }
    const report: ImportReport = {
      source: h.source,
      backup: `${Date.now()}-before-${h.source}-import`,
      on_conflict: choice,
      sections: sections.map((s) => ({
        kind: s.kind,
        found: s.found,
        added: s.new,
        replaced: s.replaced,
        kept: s.kept,
        waiting: s.waiting,
        needs_match: s.needs_match,
        skipped: s.skipped,
        skipped_items: s.skipped_items,
        needs_match_items: s.needs_match_items,
        notes: s.notes,
      })),
      not_imported: h.not_imported,
    }
    return { preview, report }
  }
}

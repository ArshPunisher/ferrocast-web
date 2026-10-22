// Pro "Dashboard anywhere" in the demo, like the engine and relay (`crates/server/src/remote.rs`,
// `crates/relay/src/remote`): devices listed without Pro (so revoking always works), links only
// with Pro and the feature (402), 409 at 5 own devices or 10 mods (unused links count), a
// one-time code that "pairs" after a moment, and an audit trail.

import type { ProView } from '../../pro'
import {
  REMOTE_CODE_TTL_MS,
  REMOTE_LIMITS,
  type RemoteAuditLine,
  type RemoteDevice,
  type RemoteLink,
  type RemoteRole,
  type RemoteView,
} from '../../remote'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type DemoFeature, type Routed } from './host'

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const DEMO_REMOTE_URL = 'https://ferrocast.clearcraftlabs.com'

function minutesAgo(n: number): number {
  return Date.now() - n * 60_000
}

export class DemoRemote implements DemoFeature {
  private devices: RemoteDevice[] = [
    {
      id: 'dv_7f3a1c2e9b4d0a11',
      name: 'Pixel 8',
      role: 'owner',
      created_at: minutesAgo(60 * 24 * 6),
      last_used_at: minutesAgo(12),
      expires_at: minutesAgo(12) + 30 * 86_400_000,
    },
    {
      id: 'dv_02c9e4b17a5f3d80',
      name: 'Meera (mod)',
      role: 'mod',
      created_at: minutesAgo(60 * 24 * 2),
      last_used_at: minutesAgo(60 * 3),
      expires_at: minutesAgo(60 * 3) + 30 * 86_400_000,
    },
  ]
  private audit: RemoteAuditLine[] = [
    {
      device_id: 'dv_02c9e4b17a5f3d80',
      device_name: 'Meera (mod)',
      action: 'POST /mod/timeout',
      status: 200,
      at: minutesAgo(60 * 3),
    },
    {
      device_id: 'dv_02c9e4b17a5f3d80',
      device_name: 'Meera (mod)',
      action: 'POST /mod/held/{event_id}/drop',
      status: 200,
      at: minutesAgo(60 * 3 + 4),
    },
    {
      device_id: 'dv_7f3a1c2e9b4d0a11',
      device_name: 'Pixel 8',
      action: 'PUT /settings',
      status: 200,
      at: minutesAgo(12),
    },
  ]
  private codes: { code: string; role: RemoteRole; name: string; expires_at: number }[] = []
  private n = 0

  constructor(private readonly pro: () => ProView) {}

  /** Tests: no devices yet. */
  setEmpty(): void {
    this.devices = []
    this.audit = []
  }

  private available(): boolean {
    const p = this.pro()
    return p.active && p.features.remote
  }

  private view(): RemoteView {
    const on = this.available()
    return clone({
      devices: [...this.devices].sort((a, b) => b.created_at - a.created_at),
      // Newest first; for the same millisecond, the one added last first.
      audit: [...this.audit]
        .reverse()
        .sort((a, b) => b.at - a.at)
        .slice(0, 50),
      limits: { ...REMOTE_LIMITS },
      pc_online: on && this.devices.length > 0,
      tunnel: {
        state: on && (this.devices.length > 0 || this.codes.length > 0) ? 'connected' : 'off',
        detail: null,
        since: Date.now(),
      },
      available: on,
    })
  }

  private link(body: unknown): RemoteLink {
    const b = requireObj(body)
    if (b.role !== 'owner' && b.role !== 'mod')
      throw new HttpError(400, 'invalid', 'role: "owner" (your own phone) or "mod".')
    if (!this.available())
      throw new HttpError(
        402,
        'pro_required',
        'This runs on Ferrocast’s servers and is part of Pro.',
        'See Settings › Pro. Everything free in Ferrocast stays free.',
      )
    const role: RemoteRole = b.role
    const now = Date.now()
    this.codes = this.codes.filter((c) => c.expires_at > now)
    const used =
      this.devices.filter((d) => d.role === role).length +
      this.codes.filter((c) => c.role === role).length
    const max = REMOTE_LIMITS[role]
    if (used >= max)
      throw new HttpError(
        409,
        'too_many_devices',
        role === 'owner'
          ? `This PC already has ${max} of your own devices.`
          : `This PC already has ${max} mods.`,
        'Remove one in Settings › Dashboard anywhere first. Unused links count until they expire (10 minutes).',
      )
    const raw = typeof b.name === 'string' ? b.name.trim().slice(0, 40) : ''
    const name = raw || (role === 'owner' ? 'My phone' : 'Mod')
    let code = ''
    for (let i = 0; i < 10; i++) code += ALPHABET[(this.n * 7 + i * 13 + now) % ALPHABET.length]
    this.n++
    const link = { code, role, name, expires_at: now + REMOTE_CODE_TTL_MS }
    this.codes.push(link)
    return {
      ...link,
      expires_in: REMOTE_CODE_TTL_MS / 1000,
      url: `${DEMO_REMOTE_URL}/app/#pair=${code}`,
    }
  }

  /** Tests: the phone opened the newest link. */
  pairNewest(): RemoteDevice | null {
    const c = this.codes.pop()
    if (!c) return null
    const now = Date.now()
    const d: RemoteDevice = {
      id: `dv_${(now + this.n).toString(16).padStart(16, '0').slice(-16)}`,
      name: c.name,
      role: c.role,
      created_at: now,
      last_used_at: now,
      expires_at: now + 30 * 86_400_000,
    }
    this.devices.push(d)
    this.audit.push({
      device_id: d.id,
      device_name: d.name,
      action: 'PAIR device',
      status: 200,
      at: now,
    })
    return clone(d)
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'pro' || seg[1] !== 'remote') return NOT_MINE
    if (seg.length === 2 && method === 'GET') return this.view()
    if (seg.length === 3 && seg[2] === 'codes' && method === 'POST') return this.link(body)
    if (seg.length === 4 && seg[2] === 'devices' && method === 'DELETE') {
      const d = this.devices.find((x) => x.id === seg[3])
      if (!d) throw new HttpError(404, 'not_found', 'That device isn’t paired with this PC.')
      this.devices = this.devices.filter((x) => x.id !== d.id)
      this.audit.push({
        device_id: d.id,
        device_name: d.name,
        action: 'REVOKE device',
        status: 204,
        at: Date.now(),
      })
      return undefined
    }
    return NOT_MINE
  }
}

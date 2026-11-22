// Local API keys in the demo (`GET/POST /api/v1/api-keys`, `DELETE /api/v1/api-keys/:id`, R34).

import {
  API_KEY_LIMITS,
  API_KEY_SCOPES,
  type ApiKeyAuditEntry,
  type ApiKeyCreated,
  type ApiKeyScope,
  type ApiKeySummary,
  type ApiKeysView,
} from '../../api-keys'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, requireObj, type DemoFeature, type Routed } from './host'

const VALID_SCOPES = new Set<string>(API_KEY_SCOPES.map((s) => s.id))
const MAX_EXPIRY_MS = 5 * 365 * 24 * 60 * 60 * 1000

function minutesAgo(n: number): number {
  return Date.now() - n * 60_000
}

function randomHex64(seed: number): string {
  const bytes = new Uint8Array(32)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 32; i++) bytes[i] = ((seed * 31 + i * 17) ^ 0xa5) & 0xff
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

export class DemoApiKeys implements DemoFeature {
  private keys: ApiKeySummary[] = [
    {
      id: 'key_demo_streamdeck',
      name: 'Stream Deck XL',
      prefix: 'fc_key_7a91c4e0...',
      scopes: ['read_only', 'studio_control'],
      created_at: minutesAgo(60 * 24 * 4),
      expires_at: null,
      last_used_at: minutesAgo(6),
      revoked_at: null,
    },
    {
      id: 'key_demo_bot',
      name: 'Node Follow Reactor',
      prefix: 'fc_key_3b18f204...',
      scopes: ['read_only', 'alerts', 'chat'],
      created_at: minutesAgo(60 * 14),
      expires_at: Date.now() + 90 * 86_400_000,
      last_used_at: minutesAgo(2),
      revoked_at: null,
    },
  ]

  private audit: ApiKeyAuditEntry[] = [
    {
      id: 'aud_1',
      key_id: 'key_demo_bot',
      key_name: 'Node Follow Reactor',
      method: 'POST',
      path: '/test',
      status: 200,
      at: minutesAgo(2),
    },
    {
      id: 'aud_2',
      key_id: 'key_demo_streamdeck',
      key_name: 'Stream Deck XL',
      method: 'POST',
      path: '/obs/scene',
      status: 200,
      at: minutesAgo(6),
    },
    {
      id: 'aud_3',
      key_id: 'key_demo_streamdeck',
      key_name: 'Stream Deck XL',
      method: 'GET',
      path: '/accounts',
      status: 403,
      at: minutesAgo(18),
    },
  ]

  private seq = 1

  setEmpty(): void {
    this.keys = []
    this.audit = []
  }

  private view(): ApiKeysView {
    return clone({
      keys: [...this.keys].sort((a, b) => b.created_at - a.created_at),
      audit: [...this.audit].sort((a, b) => b.at - a.at).slice(0, 100),
    })
  }

  private create(body: unknown): ApiKeyCreated {
    const b = requireObj(body)
    if (typeof b.name !== 'string') {
      throw new HttpError(400, 'invalid', 'API key name cannot be empty.')
    }
    const name = b.name.trim()
    if (!name) throw new HttpError(400, 'invalid', 'API key name cannot be empty.')
    if (Array.from(name).length > API_KEY_LIMITS.maxNameLen) {
      throw new HttpError(400, 'invalid', 'API key name must be 60 characters or fewer.')
    }
    if (hasControlChar(name)) {
      throw new HttpError(400, 'invalid', 'API key name cannot contain control characters.')
    }

    if (!Array.isArray(b.scopes) || b.scopes.length === 0) {
      throw new HttpError(400, 'invalid', 'Pick at least one scope for the API key.')
    }
    const deduped = new Set<ApiKeyScope>()
    for (const raw of b.scopes) {
      if (typeof raw !== 'string' || !VALID_SCOPES.has(raw)) {
        throw new HttpError(400, 'invalid', 'Unknown API key scope requested.')
      }
      deduped.add(raw as ApiKeyScope)
    }
    const order = API_KEY_SCOPES.map((s) => s.id)
    const scopes = Array.from(deduped).sort((a, c) => order.indexOf(a) - order.indexOf(c))

    const now = Date.now()
    let expires_at: number | null = null
    if (b.expires_at !== undefined && b.expires_at !== null) {
      if (typeof b.expires_at !== 'number' || !Number.isFinite(b.expires_at)) {
        throw new HttpError(400, 'invalid', 'Expiry time must be a valid timestamp.')
      }
      if (b.expires_at <= now) {
        throw new HttpError(400, 'invalid', 'Expiry time must be in the future.')
      }
      if (b.expires_at > now + MAX_EXPIRY_MS) {
        throw new HttpError(
          400,
          'invalid',
          'Expiry time cannot be more than 5 years in the future.',
        )
      }
      expires_at = Math.trunc(b.expires_at)
    }

    const activeCount = this.keys.filter((k) => k.revoked_at === null).length
    if (activeCount >= API_KEY_LIMITS.maxActiveKeys) {
      throw new HttpError(
        409,
        'conflict',
        `You can have at most ${API_KEY_LIMITS.maxActiveKeys} active API keys. Revoke an unused key first.`,
      )
    }

    const token = `fc_key_${randomHex64(now + this.seq++)}`
    const prefix = `${token.slice(0, 15)}...`
    const key: ApiKeySummary = {
      id: `key_${now.toString(36)}_${this.seq}`,
      name,
      prefix,
      scopes,
      created_at: now,
      expires_at,
      last_used_at: null,
      revoked_at: null,
    }
    // Store metadata only; plain token is returned once and never kept on disk or memory.
    this.keys.unshift(key)
    return { key: clone(key), token }
  }

  private revoke(id: string): null {
    const existing = this.keys.find((k) => k.id === id)
    if (!existing) throw new HttpError(404, 'not_found', 'API key not found.')
    existing.revoked_at ??= Date.now()
    return null
  }

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'api-keys') return NOT_MINE
    if (seg.length === 1 && method === 'GET') return this.view()
    if (seg.length === 1 && method === 'POST') return this.create(body)
    if (seg.length === 2 && method === 'DELETE') return this.revoke(seg[1] ?? '')
    return NOT_MINE
  }
}

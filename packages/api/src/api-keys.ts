// Scoped local API keys & machine-readable specifications (API-REQUESTS R34, Roadmap Phase 3 #19).

import type { FerroClient } from './client'

export type ApiKeyScope =
  'read_only' | 'chat' | 'alerts' | 'studio_control' | 'go_live' | 'settings'

export interface ApiKeyScopeInfo {
  id: ApiKeyScope
  label: string
  summary: string
}

export const API_KEY_SCOPES: readonly ApiKeyScopeInfo[] = [
  {
    id: 'read_only',
    label: 'Read only',
    summary: 'Read stream status, events, chat, overlays, OBS scenes, and settings (GET only).',
  },
  {
    id: 'chat',
    label: 'Chat',
    summary: 'Send messages, moderate chat, and run commands, timers, counters, polls, and TTS.',
  },
  {
    id: 'alerts',
    label: 'Alerts',
    summary: 'Manage overlays, alert rules, test alerts, alert queue controls, goals, and replays.',
  },
  {
    id: 'studio_control',
    label: 'Studio control',
    summary:
      'Switch scenes, control Studio Engine & OBS sources, audio mix, moments, and automations.',
  },
  {
    id: 'go_live',
    label: 'Go live',
    summary: 'Control shows, stream title/category info, OBS streaming, and multistream toggles.',
  },
  {
    id: 'settings',
    label: 'Settings',
    summary:
      'Update safe preferences (excluding LAN access), trigger backups, and configure switcher rules.',
  },
] as const

export const API_KEY_LIMITS = {
  maxNameLen: 60,
  maxActiveKeys: 32,
  rateLimitPerMin: 120,
} as const

export interface ApiKeyCreate {
  name: string
  scopes: ApiKeyScope[]
  expires_at?: number | null
}

export interface ApiKeySummary {
  id: string
  name: string
  prefix: string
  scopes: ApiKeyScope[]
  created_at: number
  expires_at: number | null
  last_used_at: number | null
  revoked_at: number | null
}

export interface ApiKeyCreated {
  key: ApiKeySummary
  /** Plain secret (`fc_key_<64 hex>`) shown once at creation and never stored or returned again. */
  token: string
}

export interface ApiKeyAuditEntry {
  id: string
  key_id: string
  key_name: string
  method: string
  path: string
  status: number
  at: number
}

export interface ApiKeysView {
  keys: ApiKeySummary[]
  audit: ApiKeyAuditEntry[]
}

/** `Settings › Advanced › Local API keys` requests (PC-only). */
export function apiKeysApi(c: FerroClient) {
  return {
    list: () => c.request<ApiKeysView>('GET', '/api/v1/api-keys'),
    create: (body: ApiKeyCreate) => c.request<ApiKeyCreated>('POST', '/api/v1/api-keys', body),
    revoke: (id: string) => c.request<void>('DELETE', `/api/v1/api-keys/${encodeURIComponent(id)}`),
  }
}

export function isApiKeyActive(
  key: Pick<ApiKeySummary, 'revoked_at' | 'expires_at'>,
  now = Date.now(),
): boolean {
  if (key.revoked_at !== null) return false
  return key.expires_at === null || key.expires_at > now
}

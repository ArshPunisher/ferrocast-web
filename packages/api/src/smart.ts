// Pro smart features (API.md §4 "Smart features", relay §9.10): smart moderation, smart
// replies and the written stream recap. In the product they are never called "AI".

import type { FerroClient } from './client'
import type { ProQuota } from './pro'
import type { Platform } from './types'

export type SmartModMode = 'off' | 'suggest' | 'act'

export interface SmartSettings {
  moderation: SmartModMode
  /** How long an automatic timeout lasts (10 to 600 s). */
  act_timeout_s: number
  /** The streamer's own extra words for moderation (at most 500 characters). */
  rules: string
  replies: boolean
  /** The facts smart replies use (at most 2,000 characters). */
  about: string
  /** At most one smart reply per platform this often (30 to 3,600 s). */
  reply_gap_s: number
}

export interface SmartError {
  status: number
  code: string
  message: string
  hint: string
  retry_after: number | null
  at: number
}

export interface SmartView {
  settings: SmartSettings
  about_approved: boolean
  pro: boolean
  /** The relay has a free-tier model set up (`features.smart`). */
  available: boolean
  /** Both: the features run. */
  active: boolean
  quotas: Partial<Record<'smart_moderation' | 'smart_replies' | 'smart_recaps', ProQuota>>
  moderation_paused_until: number | null
  replies_paused_until: number | null
  last_error: SmartError | null
  waiting: number
}

export type SmartAction = 'delete' | 'timeout' | 'ban'

export interface SmartSuggestion {
  id: string
  platform: Platform
  user_id: string | null
  login: string | null
  name: string
  text: string
  message_id: string | null
  action: SmartAction
  category: string
  reason: string
  confidence: number
  at: number
  state: 'suggested' | 'done' | 'undone' | 'dismissed'
  done: SmartAction | null
  /** `smart`: done on its own ("Act on clear cases"); `you`: from the dashboard. */
  by: 'smart' | 'you' | null
  seconds: number | null
  error: string | null
}

export interface SmartReply {
  at: number
  platform: Platform
  name: string
  question: string
  reply: string
}

export interface SmartLog {
  items: SmartSuggestion[]
  replies: SmartReply[]
}

export interface RecapSummary {
  started_at: number | null
  summary: string | null
  at: number | null
}

export const SMART_LIMITS = {
  rules: 500,
  about: 2000,
  actTimeout: { min: 10, max: 600 },
  replyGap: { min: 30, max: 3600 },
} as const

export function smartApi(c: FerroClient) {
  return {
    view: () => c.request<SmartView>('GET', '/api/v1/pro/smart'),
    save: (patch: Partial<SmartSettings>) =>
      c.request<SmartView>('PUT', '/api/v1/pro/smart', patch),
    approve: (about: string) =>
      c.request<SmartView>('POST', '/api/v1/pro/smart/about/approve', { about }),
    log: () => c.request<SmartLog>('GET', '/api/v1/pro/smart/moderation'),
    apply: (id: string, action?: SmartAction, seconds?: number) =>
      c.request<SmartSuggestion>(
        'POST',
        `/api/v1/pro/smart/moderation/${encodeURIComponent(id)}/apply`,
        {
          ...(action ? { action } : {}),
          ...(seconds !== undefined ? { seconds } : {}),
        },
      ),
    undo: (id: string) =>
      c.request<SmartSuggestion>(
        'POST',
        `/api/v1/pro/smart/moderation/${encodeURIComponent(id)}/undo`,
        {},
      ),
    dismiss: (id: string) =>
      c.request<SmartSuggestion>(
        'POST',
        `/api/v1/pro/smart/moderation/${encodeURIComponent(id)}/dismiss`,
        {},
      ),
    recapSaved: () => c.request<RecapSummary>('GET', '/api/v1/recap/summary'),
    writeRecap: () => c.request<RecapSummary>('POST', '/api/v1/recap/summary', {}),
  }
}

/** "Hinglish insult · 92% sure" style label pieces for a suggestion. */
export function actionLabel(a: SmartAction): string {
  return a === 'delete' ? 'Delete' : a === 'timeout' ? 'Time out' : 'Ban'
}

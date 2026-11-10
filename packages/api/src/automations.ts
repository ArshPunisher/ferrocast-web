// "When X, do Y" (API.md "Automations"): rules that run steps when something happens.

import type { FerroClient } from './client'

export type When =
  | { type: 'follow' }
  | { type: 'raid'; min: number }
  | { type: 'sub' }
  | { type: 'support' }
  | { type: 'reward'; name: string }
  | { type: 'chat'; text: string; anyone: boolean }
  | { type: 'live_start' }
  | { type: 'live_end' }
  | { type: 'scene'; name: string }
  | { type: 'every'; minutes: number }

export type Step =
  | { type: 'scene'; name: string }
  | { type: 'show'; scene: string; source: string }
  | { type: 'hide'; scene: string; source: string }
  | { type: 'filter'; source: string; filter: string; on: boolean }
  | { type: 'save_replay' }
  | { type: 'record'; on: boolean }
  | { type: 'chat'; text: string }
  | { type: 'wait'; seconds: number }

export interface Rule {
  id: string
  name: string
  on: boolean
  when: When
  then: Step[]
  /** Seconds before it can run again (3 to 3600). */
  cooldown_s: number
}

export const MAX_RULES = 50
export const MAX_STEPS = 10

export function automationsApi(client: FerroClient) {
  return {
    list: () => client.request<Rule[]>('GET', '/api/v1/automations'),
    /** Saves the whole list (checked by the PC first). */
    save: (rules: Rule[]) => client.request<Rule[]>('PUT', '/api/v1/automations', rules),
    /** Runs a rule's steps now (its Test button). */
    run: (id: string) =>
      client.request<void>('POST', `/api/v1/automations/${encodeURIComponent(id)}/run`),
  }
}

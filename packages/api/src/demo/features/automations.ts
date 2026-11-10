// "When X, do Y" in the demo (`/automations`, API.md "Automations"): the PC's checks, and a
// Test button that only says it ran. Starts with one rule so the page has something to show.

import type { Rule } from '../../automations'
import { MAX_RULES, MAX_STEPS } from '../../automations'
import { HttpError } from '../http-error'
import { NOT_MINE, clone, type Routed } from './host'

const SAMPLE: Rule = {
  id: 'clip',
  name: 'Clip it',
  on: true,
  cooldown_s: 30,
  when: { type: 'chat', text: '!clip', anyone: false },
  then: [{ type: 'save_replay' }, { type: 'chat', text: 'Saved, {name}!' }],
}

const WHENS = [
  'follow',
  'raid',
  'sub',
  'support',
  'reward',
  'chat',
  'live_start',
  'live_end',
  'scene',
  'every',
]
const STEPS = ['scene', 'show', 'hide', 'filter', 'save_replay', 'record', 'chat', 'wait']

function bad(message: string): HttpError {
  return new HttpError(422, 'automation_invalid', message, 'Fix the rule and save again.')
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)

function text(what: string, v: unknown, emptyOk = false) {
  const s = str(v)
  if (!emptyOk && !s.trim()) throw bad(`${what} is empty.`)
  if ([...s].length > 300) throw bad(`${what} is longer than 300 characters.`)
}

/** The PC's checks (crates/engine/src/automation.rs `check`). */
export function checkRules(body: unknown): Rule[] {
  if (!Array.isArray(body)) throw new HttpError(400, 'invalid', 'Send the list of rules.')
  if (body.length > MAX_RULES) throw bad(`Up to ${MAX_RULES} rules.`)
  const ids = new Set<string>()
  for (const r of body as Record<string, unknown>[]) {
    const id = str(r?.id)
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id))
      throw bad(`The rule id "${id}" isn’t one (letters, digits, - and _).`)
    if (ids.has(id)) throw bad(`Two rules have the id "${id}".`)
    ids.add(id)
    const name = str(r.name).trim()
    if (!name || [...name].length > 60)
      throw bad('A rule’s name is empty or longer than 60 characters.')
    const cd = num(r.cooldown_s ?? 10)
    if (!(cd >= 3 && cd <= 3600)) throw bad(`"${name}": wait 3 to 3600 seconds between runs.`)
    const w = (r.when ?? {}) as Record<string, unknown>
    if (!WHENS.includes(str(w.type))) throw new HttpError(400, 'invalid', 'An unknown “when”.')
    if (w.type === 'chat') text(`"${name}"’s chat command`, w.text)
    if (w.type === 'scene') text(`"${name}"’s scene`, w.name)
    if (w.type === 'every' && !(num(w.minutes) >= 1 && num(w.minutes) <= 720))
      throw bad(`"${name}": every 1 to 720 minutes.`)
    const then = Array.isArray(r.then) ? (r.then as Record<string, unknown>[]) : []
    if (then.length === 0) throw bad(`"${name}" has nothing to do: add a step.`)
    if (then.length > MAX_STEPS) throw bad(`"${name}": up to ${MAX_STEPS} steps.`)
    for (const s of then) {
      if (!STEPS.includes(str(s?.type))) throw new HttpError(400, 'invalid', 'An unknown step.')
      if (s.type === 'scene') text('A scene', s.name)
      if (s.type === 'show' || s.type === 'hide') {
        text('A scene', s.scene)
        text('A source', s.source)
      }
      if (s.type === 'filter') {
        text('A source', s.source)
        text('A filter', s.filter)
      }
      if (s.type === 'chat') text('A chat message', s.text)
      if (s.type === 'wait' && !(num(s.seconds) >= 1 && num(s.seconds) <= 600))
        throw bad(`"${name}": wait 1 to 600 seconds.`)
    }
  }
  return clone(body as Rule[])
}

export class DemoAutomations {
  private rules: Rule[] = [clone(SAMPLE)]

  route(method: string, seg: string[], body: unknown): Routed {
    if (seg[0] !== 'automations') return NOT_MINE
    if (seg.length === 1 && method === 'GET') return clone(this.rules)
    if (seg.length === 1 && method === 'PUT') {
      this.rules = checkRules(body)
      return clone(this.rules)
    }
    if (seg.length === 3 && seg[2] === 'run' && method === 'POST') {
      if (!this.rules.some((r) => r.id === seg[1]))
        throw new HttpError(
          404,
          'automation_not_found',
          'There’s no such rule.',
          'Refresh the list of rules.',
        )
      return null
    }
    return NOT_MINE
  }
}

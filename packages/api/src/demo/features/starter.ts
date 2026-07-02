// The starter command pack in the demo, matching the engine (`crates/core/src/starter.rs`):
// the same four commands, skipping any name a command or alias already uses.

import type { Command, StarterResult } from '../../types'
import { NOT_MINE, clone, type Routed } from './host'

export const STARTER: Omit<Command, 'id'>[] = [
  {
    name: '!socials',
    aliases: [],
    response: 'Find me everywhere: add your links to this reply in Ferrocast (Bot, !socials).',
    roles: 'everyone',
    cooldown_s: 30,
    user_cooldown_s: 0,
    platforms: [],
    enabled: true,
  },
  {
    name: '!lurk',
    aliases: [],
    response: '{user} is lurking. Thanks for hanging out!',
    roles: 'everyone',
    cooldown_s: 0,
    user_cooldown_s: 300,
    platforms: [],
    enabled: true,
  },
  {
    name: '!uptime',
    aliases: [],
    response: '{uptime_text}',
    roles: 'everyone',
    cooldown_s: 10,
    user_cooldown_s: 0,
    platforms: [],
    enabled: true,
  },
  {
    name: '!so',
    aliases: [],
    response: 'Go show {target} some love and give them a follow! {target_game_note}',
    roles: 'mods',
    cooldown_s: 5,
    user_cooldown_s: 0,
    platforms: [],
    enabled: true,
  },
]

export class DemoStarter {
  constructor(private readonly commands: () => Command[]) {}

  route(method: string, seg: string[]): Routed {
    if (seg[0] !== 'commands' || seg[1] !== 'starter' || seg.length !== 2 || method !== 'POST')
      return NOT_MINE
    const list = this.commands()
    const out: StarterResult = { added: [], skipped: [] }
    for (const c of STARTER) {
      const taken = list.some((o) =>
        [o.name, ...o.aliases].some((n) => n.toLowerCase() === c.name.toLowerCase()),
      )
      if (taken) {
        out.skipped.push(c.name)
        continue
      }
      const cmd = { ...clone(c), id: `c-${c.name.slice(1)}-${crypto.randomUUID().slice(0, 8)}` }
      list.push(cmd)
      out.added.push(clone(cmd))
    }
    return out
  }
}

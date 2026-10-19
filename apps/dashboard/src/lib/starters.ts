// Which starter commands (core::starter) a list still lacks. The engine skips any name a
// command or alias already uses, so a name taken either way counts as there.

import type { Command } from '@ferrocast/api'

export const STARTER_NAMES = ['!socials', '!lurk', '!uptime', '!so'] as const

export function missingStarters(commands: readonly Pick<Command, 'name' | 'aliases'>[]): string[] {
  const taken = new Set(commands.flatMap((c) => [c.name, ...c.aliases]).map((n) => n.toLowerCase()))
  return STARTER_NAMES.filter((n) => !taken.has(n))
}

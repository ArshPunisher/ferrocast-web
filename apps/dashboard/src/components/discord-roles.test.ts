import { describe, expect, it } from 'vitest'
import { rolesHint } from './discord-pro'

describe('rolesHint', () => {
  it('asks for a role first when the server has none', () => {
    expect(rolesHint([])).toMatch(/^Make a role in Discord first .*press Refresh\.$/)
  })
  it('asks to move Ferrocast’s role when none can be given', () => {
    expect(rolesHint([{ assignable: false }])).toMatch(/^Move Ferrocast’s role above/)
  })
  it('says nothing once a role can be given', () => {
    expect(rolesHint([{ assignable: false }, { assignable: true }])).toBeNull()
  })
})

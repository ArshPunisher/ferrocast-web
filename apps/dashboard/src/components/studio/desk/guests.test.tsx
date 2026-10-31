import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { GuestLists } from './guests'
import { KIND_GROUPS } from './common'

const noop = () => undefined
const view = (p: Partial<Parameters<typeof GuestLists>[0]>) =>
  renderToStaticMarkup(
    <GuestLists
      invites={[]}
      guests={[]}
      busy={null}
      onCopy={noop}
      onMake={noop}
      onRemove={noop}
      onHangUp={noop}
      {...p}
    />,
  )

describe('guests', () => {
  it('are a kind to add, beside the camera', () => {
    const capture = KIND_GROUPS.find((g) => g.label === 'Capture')
    expect(capture?.entries.find((e) => e.key === 'guest')?.guest).toBe(true)
  })

  it('start with a way to make the first link', () => {
    const html = view({})
    expect(html).toContain('No links yet.')
    expect(html).toContain('New guest link')
    expect(html).toContain('Nobody yet.')
  })

  it('list each link to copy or remove, and each guest to hang up on', () => {
    const html = view({
      invites: [
        {
          id: 'abc',
          label: 'Guest',
          url: 'https://x/app/guest.html#tok',
          created_ms: 1,
          expires_ms: 2,
        },
      ],
      guests: [
        { name: 'Asha', source: 'Guest: Asha', connected: true, video: true, audio: true },
        { name: 'Ravi', source: 'Guest: Ravi', connected: false, video: false, audio: false },
      ],
    })
    expect(html).toContain('https://x/app/guest.html#tok')
    expect(html).toContain('aria-label="Copy link"')
    expect(html).toContain('aria-label="Remove link"')
    expect(html).toContain('Asha')
    expect(html).toContain('Connected')
    expect(html).toContain('Connecting')
    expect(html.match(/Hang up/g)?.length).toBe(2)
  })
})

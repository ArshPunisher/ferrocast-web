import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NO_PRO_FEATURES, type ProView } from '@ferrocast/api'
import { ProChip } from './ProChip'
import { PRO_LINE, ProPanelView } from './ProPanel'
import { href, parseRoute } from '../../lib/router'

const view = (over: Partial<ProView> = {}): ProView => ({
  active: false,
  pro: false,
  status: 'none',
  plan: null,
  subscription_id: null,
  current_end: null,
  access_until: null,
  cancel_at_period_end: false,
  refunded: false,
  installs: 0,
  sales_open: false,
  prices: null,
  checked_at: 0,
  stale: false,
  offline_grace_days: 7,
  launch_note: '',
  warning: null,
  features: { ...NO_PRO_FEATURES },
  quotas: {},
  ...over,
})

const panel = (pro: ProView | null, feature?: 'history') =>
  renderToStaticMarkup(
    <ProPanelView pro={pro} title="Stream history" id="x" {...(feature ? { feature } : {})}>
      <p>the feature</p>
    </ProPanelView>,
  )

describe('ProChip', () => {
  it('says Pro and is named in full for screen readers', () => {
    const html = renderToStaticMarkup(<ProChip />)
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Part of Ferrocast Pro"')
    expect(html).toContain('>Pro<')
  })
})

describe('ProPanelView', () => {
  it('renders nothing while loading or when Pro is neither active nor on sale', () => {
    expect(panel(null)).toBe('')
    expect(panel(view())).toBe('')
  })

  it('shows one calm line and a link to Settings › Pro when on sale', () => {
    const html = panel(view({ sales_open: true }))
    expect(html).toContain(PRO_LINE)
    expect(html).toContain('href="#/settings/pro"')
    expect(html).toContain('Part of Ferrocast Pro')
    expect(html).not.toContain('the feature')
  })

  it('shows the feature itself for Pro', () => {
    const html = panel(view({ active: true }))
    expect(html).toContain('the feature')
    expect(html).not.toContain(PRO_LINE)
  })

  it('stays hidden for a feature the relay does not have yet', () => {
    expect(panel(view({ active: true }), 'history')).toBe('')
    expect(
      panel(view({ active: true, features: { ...NO_PRO_FEATURES, history: true } }), 'history'),
    ).toContain('the feature')
  })
})

describe('the history route', () => {
  it('round-trips, and the old demo preview is gone (Home)', () => {
    expect(parseRoute('#/history')).toEqual({ name: 'history' })
    expect(href({ name: 'history' })).toBe('#/history')
    expect(parseRoute('#/preview/pro')).toEqual({ name: 'home' })
  })
})

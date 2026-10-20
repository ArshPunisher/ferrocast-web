import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NO_PRO_FEATURES, type ProView } from '@ferrocast/api'
import { ProChip } from './ProChip'
import { PRO_LINE, ProPanelView } from './ProPanel'
import { href, parseRoute } from '../../lib/router'
import { accountInitials, proPlanLine } from '../../lib/pro-status'
import { canBuyPro, canManagePro, emailProblem, planCopy, proSummary, renewsOn } from '../pro'

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

describe('Settings › Pro card', () => {
  const prices = { currency: 'INR' as const, monthly: 19_900, yearly: 199_900 }

  it('words both plans the way the cards show them', () => {
    expect(planCopy(prices, 'monthly')).toMatchObject({
      price: '₹199',
      per: 'a month',
      sub: 'Cancel any time',
      save: null,
    })
    expect(planCopy(prices, 'yearly')).toMatchObject({
      price: '₹1,999',
      per: 'a year',
      sub: 'About ₹167 a month',
      save: 'Save ₹389',
    })
    // A yearly price that saves nothing says nothing about saving.
    expect(planCopy({ ...prices, yearly: 12 * 19_900 }, 'yearly').save).toBeNull()
  })

  it('checks the email before anything is sent', () => {
    expect(emailProblem('')).toMatch(/Add an email/)
    expect(emailProblem('   ')).toMatch(/Add an email/)
    expect(emailProblem('noor@plays')).toMatch(/incomplete/)
    expect(emailProblem('no spaces@x.com')).toMatch(/incomplete/)
    expect(emailProblem(' noor.plays@example.com ')).toBeNull()
  })

  it('renews a month or a year from today', () => {
    const from = new Date(2026, 9, 20)
    expect(renewsOn('yearly', from)).toContain('2027')
    expect(renewsOn('monthly', from)).toMatch(/Nov/)
    // 31 Jan renews on the last day of February, never in March.
    expect(renewsOn('monthly', new Date(2027, 0, 31))).toBe(
      new Date(2027, 1, 28).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    )
    expect(renewsOn('yearly', new Date(2028, 1, 29))).toMatch(/28/)
  })

  it('sells only when on sale and nothing is running', () => {
    const p = view({ sales_open: true, prices })
    expect(canBuyPro(p)).toBe(true)
    expect(canBuyPro({ ...p, sales_open: false })).toBe(false)
    expect(canBuyPro({ ...p, prices: null })).toBe(false)
    expect(canBuyPro({ ...p, active: true })).toBe(false)
    expect(canBuyPro({ ...p, status: 'authenticated' })).toBe(false)
    expect(canBuyPro({ ...p, status: 'cancelled' })).toBe(true)
  })

  it('never offers Manage for a test grant, running or ended', () => {
    const real = view({ active: true, status: 'active', subscription_id: 'sub_1' })
    expect(canManagePro(real)).toBe(true)
    expect(canManagePro(view())).toBe(false)
    const grant = view({ active: true, status: 'active', subscription_id: 'comp_x1' })
    expect(canManagePro(grant)).toBe(false)
    expect(canManagePro({ ...grant, active: false, status: 'cancelled' })).toBe(false)
    expect(proSummary(grant).text).toMatch(/^Test Pro is on until/)
    expect(proSummary({ ...grant, active: false, status: 'cancelled' }).text).toBe(
      'Your test Pro has ended.',
    )
  })
})

describe('the Pro account chip', () => {
  it('says the plan', () => {
    expect(proPlanLine(view({ active: true, plan: 'yearly' }))).toBe('Pro, yearly')
    expect(proPlanLine(view({ active: true, plan: 'monthly' }))).toBe('Pro, monthly')
    expect(proPlanLine(view({ active: true, subscription_id: 'comp_1' }))).toBe('Pro, test grant')
  })

  it('makes initials from any channel name', () => {
    expect(accountInitials('NovaPlays')).toBe('NP')
    expect(accountInitials('noor_plays')).toBe('NP')
    expect(accountInitials('Meera')).toBe('M')
    expect(accountInitials('ålborg gamer')).toBe('ÅG')
    expect(accountInitials('___')).toBe('FC')
    expect(accountInitials('')).toBe('FC')
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import {
  TIP_DOMAIN_LIMITS,
  normaliseTipDomain,
  tipDomainApi,
  tipDomainClaimProof,
  tipDomainProblem,
  tipDomainStep,
} from '../src/tip-domain'
import { remoteAllowed } from '../src/remote'
import { NO_PRO_FEATURES } from '../src/pro'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'

describe('own tip address helpers', () => {
  it('normalises like the relay', () => {
    expect(normaliseTipDomain('  TIPS.MyChannel.COM. ')).toBe('tips.mychannel.com')
    expect(normaliseTipDomain('https://tips.mychannel.com/')).toBe('tips.mychannel.com')
    expect(normaliseTipDomain('Tips.Bücher.de')).toBe('tips.xn--bcher-kva.de')
    expect(normaliseTipDomain('tips.x.com:8080')).toBeNull()
  })

  it('says why an address can’t be used', () => {
    expect(tipDomainProblem('tips.mychannel.com')).toBeNull()
    expect(tipDomainProblem('live.tips.mychannel.co.uk')).toBeNull()
    expect(tipDomainProblem('tips.bücher.de')).toBeNull()
    const cases: [string, RegExp][] = [
      ['', /Type the address/],
      ['*.mychannel.com', /Wildcards/],
      ['203.0.113.9', /IP address/],
      ['[::1]', /IP address/],
      ['tips.mychannel.com:8443', /no port/],
      ['tips.mychannel.com/x', /no port, path/],
      ['localhost', /valid address|own network/],
      ['tips.localhost', /own network/],
      ['tips.clearcraftlabs.com', /Ferrocast’s own/],
      ['bad_name.mychannel.com', /valid address/],
      ['mychannel.com', /Use a subdomain, like tips\.mychannel\.com\./],
    ]
    for (const [typed, want] of cases) expect(tipDomainProblem(typed), typed).toMatch(want)
  })

  it('only warns for an obvious bare domain; the relay judges endings with the full list', () => {
    // No drifting copy of the Public Suffix List here (finding 6).
    expect(tipDomainProblem('mychannel.co.uk')).toBeNull()
    expect(tipDomainProblem('nova.github.io')).toBeNull()
    expect(tipDomainProblem('bücher.de')).toMatch(/Use a subdomain/)
  })

  it('names each step', () => {
    expect(tipDomainStep({ status: 'pending' }).label).toBe('Pending')
    expect(tipDomainStep({ status: 'verifying' }).label).toBe('Verifying certificate')
    expect(tipDomainStep({ status: 'live' }).label).toBe('Live')
    expect(tipDomainStep({ status: 'failed' }).line).toContain('remove the address')
    expect(tipDomainStep({ status: 'proof_missing' }).label).toBe('TXT record missing')
    expect(tipDomainStep({ status: 'proof_missing' }).line).not.toMatch(/[\u2013\u2014]/)
  })

  it('is a feature flag that starts off', () => {
    expect(NO_PRO_FEATURES.tip_domain).toBe(false)
  })

  it('an owner phone may look but not change it; a mod never', () => {
    expect(remoteAllowed('owner', 'GET', '/pro/tips/domain')).toBe(true)
    expect(remoteAllowed('owner', 'PUT', '/pro/tips/domain')).toBe(false)
    expect(remoteAllowed('owner', 'DELETE', '/pro/tips/domain')).toBe(false)
    expect(remoteAllowed('mod', 'GET', '/pro/tips/domain')).toBe(false)
  })
})

describe('own tip address in the demo', () => {
  let engine: DemoEngine | null = null
  afterEach(() => {
    engine?.dispose()
    engine = null
  })
  const setup = (active: boolean, features = true) => {
    engine = new DemoEngine({
      autoplay: false,
      latencyMs: 0,
      pro: { salesOpen: true, active, features },
    })
    const c = new FerroClient({
      base: 'http://127.0.0.1:47820',
      token: DEMO_TOKEN,
      fetch: engine.fetch,
      sleep: async () => {},
    })
    return { api: tipDomainApi(c), engine }
  }
  const fails = async (p: Promise<unknown>) => {
    const e = await p.then(
      () => null,
      (x: unknown) => x,
    )
    expect(e).toBeInstanceOf(ApiError)
    return e as ApiError
  }

  it('needs Pro, and the feature on this relay', async () => {
    expect((await fails(setup(false).api.get())).status).toBe(402)
    engine?.dispose()
    const e = await fails(setup(true, false).api.save('tips.mychannel.com'))
    expect([e.status, e.code]).toEqual([503, 'domains_unavailable'])
    expect(e.hint).toBeTruthy()
  })

  it('adds an address with the record to add, moves to live, removes it', async () => {
    const { api, engine } = setup(true)
    expect((await fails(api.get())).status).toBe(404)
    const apex = await fails(api.save('mychannel.com'))
    expect([apex.status, apex.code]).toEqual([422, 'apex_not_supported'])
    expect(apex.hint).toBeTruthy()
    const bad = await fails(api.save('*.mychannel.com'))
    expect([bad.status, bad.code]).toEqual([422, 'invalid_hostname'])
    const d = await api.save(' Tips.MyChannel.com ')
    expect(d.hostname).toBe('tips.mychannel.com')
    expect(d.status).toBe('pending')
    expect(d.dns).toEqual([
      { type: 'CNAME', name: 'tips.mychannel.com', host: 'tips', target: 'tip.clearcraftlabs.com' },
    ])
    expect(d.verification[0]?.why).toBe('ownership')
    expect(d.hostname_unicode).toBe('tips.mychannel.com')
    expect(d.proof).toMatchObject({
      type: 'TXT',
      name: '_ferrocast.tips.mychannel.com',
      host: '_ferrocast.tips',
      found: false,
    })
    expect(d.errors[0]).toContain('_ferrocast.tips.mychannel.com')
    expect(d.expires_at).toBeGreaterThan(d.created_at)
    const second = await fails(api.save('live.mychannel.com'))
    expect([second.status, second.code]).toEqual([409, 'domain_limit'])
    engine.setTipDomain({ status: 'live' })
    const live = await api.get()
    expect(live.status).toBe('live')
    expect(live.verification).toEqual([])
    expect(live.proof.found).toBe(true)
    expect(live.expires_at).toBeNull()
    engine.setTipDomain({ status: 'proof_missing' })
    const gone = await api.get()
    expect(gone.status).toBe('proof_missing')
    expect(gone.proof.found).toBe(false)
    await api.remove()
    expect((await fails(api.get())).status).toBe(404)
  })

  it('an address Cloudflare already has comes back with the TXT record that proves it', async () => {
    const { api, engine } = setup(true)
    const e = await fails(api.save('elsewhere.mychannel.com'))
    expect([e.status, e.code]).toEqual([409, 'domain_taken'])
    expect(e.message).toBe('That address is set up somewhere else on Cloudflare.')
    expect(tipDomainClaimProof(e)).toEqual({
      type: 'TXT',
      name: '_ferrocast.elsewhere.mychannel.com',
      host: '_ferrocast.elsewhere',
      value: 'ferrocast-proof-8c1f4e07b2d9a356e0f7c41b9a28d6e3',
    })
    // A plain taken one has no record; nor does any other error.
    expect(tipDomainClaimProof(await fails(api.save('taken.mychannel.com')))).toBeNull()
    expect(
      tipDomainClaimProof(new ApiError(409, 'domain_taken', 'x', null, null, { proof: 1 })),
    ).toBeNull()
    expect(tipDomainClaimProof(new Error('x'))).toBeNull()
    engine.setTipDomain({ proofPublished: true })
    const d = await api.save('elsewhere.mychannel.com')
    expect(d.hostname).toBe('elsewhere.mychannel.com')
  })

  it('refuses a taken address and too many changes', async () => {
    const { api, engine } = setup(true)
    const t = await fails(api.save('taken.mychannel.com'))
    expect([t.status, t.code]).toEqual([409, 'domain_taken'])
    engine.setTipDomain({ changesToday: TIP_DOMAIN_LIMITS.changesPerDay })
    const q = await fails(api.save('tips.mychannel.com'))
    expect([q.status, q.code]).toEqual([429, 'tip_domain_quota'])
  })
})

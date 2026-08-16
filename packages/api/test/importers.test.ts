import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DemoEngine, DEMO_SE_TOKEN, DEMO_TOKEN } from '../src/demo'
import { FerroClient } from '../src/client'
import { ApiError } from '../src/errors'

let engine: DemoEngine
let client: FerroClient

beforeEach(() => {
  engine = new DemoEngine({ autoplay: false, latencyMs: 0 })
  client = new FerroClient({ base: engine.base, token: DEMO_TOKEN, fetch: engine.fetch })
})
afterEach(() => engine.dispose())

async function failure(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p
  } catch (e) {
    if (e instanceof ApiError) return e
    throw e
  }
  throw new Error('expected a failure')
}

const csv = (text: string) => new Blob([text], { type: 'text/csv' })

describe('StreamElements importer (demo)', () => {
  it('previews without writing, then applies and reports', async () => {
    const before = (await client.commands()).length
    const p = await client.previewStreamElements(`Bearer ${DEMO_SE_TOKEN}`)
    expect(p.source).toBe('streamelements')
    expect(p.account?.platform).toBe('twitch')
    const cmds = p.sections.find((s) => s.kind === 'commands')
    expect(cmds?.conflicts).toBeGreaterThan(0) // the demo already has !so
    expect((await client.commands()).length).toBe(before)
    expect(p.not_imported.some((n) => n.what.startsWith('Overlays'))).toBe(true)

    const r = await client.applyImport(p.preview_id, 'keep')
    const added = r.sections.find((s) => s.kind === 'commands')?.added ?? 0
    expect(added).toBeGreaterThan(0)
    expect((await client.commands()).length).toBe(before + added)
    expect(r.on_conflict).toBe('keep')

    const again = await failure(client.applyImport(p.preview_id, 'keep'))
    expect([again.status, again.code]).toEqual([404, 'preview_expired'])
  })

  it('replace overwrites in place without adding duplicates', async () => {
    const p = await client.previewStreamElements(DEMO_SE_TOKEN)
    await client.applyImport(p.preview_id, 'replace')
    const names = (await client.commands()).map((c) => c.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives the engine’s errors for bad tokens and outages', async () => {
    const shape = await failure(client.previewStreamElements('my-overlay-token'))
    expect(shape.status).toBe(400)
    expect(shape.message.startsWith('token:')).toBe(true)
    const expired = await failure(client.previewStreamElements(`${DEMO_SE_TOKEN}expired`))
    expect([expired.status, expired.code]).toEqual([401, 'streamelements_token_rejected'])
    expect(expired.hint).toContain('Show secrets')
    const down = await failure(client.previewStreamElements(`${DEMO_SE_TOKEN}down`))
    expect(down.status).toBe(502)
    const slow = await failure(client.previewStreamElements(`${DEMO_SE_TOKEN}slow`))
    expect([slow.status, slow.retryAfter]).toEqual([429, 30])
    const choice = await failure(client.applyImport('x', 'merge' as unknown as 'keep'))
    expect(choice.status).toBe(400)
  })
})

describe('Streamlabs importer (demo)', () => {
  it('reads a Chatbot currency CSV', async () => {
    const p = await client.previewStreamlabs({
      platform: 'twitch',
      points: {
        file: csv('Name,Rank,Points,Hours\nnewviewer,Viewer,1500,12\nnightbot,Bot,5,1\n'),
        name: 'Currency.csv',
      },
    })
    const pts = p.sections[0]
    expect(pts?.kind).toBe('points')
    expect([pts?.found, pts?.waiting, pts?.skipped]).toEqual([2, 1, 1])
    expect(p.not_imported.some((n) => n.what === 'Commands and timers')).toBe(true)
  })

  it('never auto-pays YouTube names, but matches YouTube channel ids', async () => {
    const p = await client.previewStreamlabs({
      platform: 'youtube',
      points: {
        file: csv('Name,Channel ID,Points\nAna Plays,,40\nBo,UCbo,25\n'),
        name: 'Currency.csv',
      },
    })
    const pts = p.sections[0]
    expect([pts?.needs_match, pts?.waiting]).toEqual([1, 1])
    expect(pts?.needs_match_items[0]?.name).toContain('Ana Plays')
    const r = await client.applyImport(p.preview_id, 'keep')
    expect(r.sections[0]?.needs_match).toBe(1)
  })

  it('checks files strictly', async () => {
    const noPlatform = await failure(
      client.previewStreamlabs({ points: { file: csv('Name,Points\na,1\n'), name: 'c.csv' } }),
    )
    expect(noPlatform.status).toBe(400)
    const badCell = await failure(
      client.previewStreamlabs({
        platform: 'kick',
        points: { file: csv('Name,Points\nsam,lots\n'), name: 'c.csv' },
      }),
    )
    expect(badCell.status).toBe(422)
    expect(badCell.message).toContain('row 2, column "Points"')
    const noColumn = await failure(
      client.previewStreamlabs({
        platform: 'kick',
        points: { file: csv('Name,Score\nsam,1\n'), name: 'c.csv' },
      }),
    )
    expect(noColumn.message).toContain('no column for points')
    const pdf = await failure(
      client.previewStreamlabs({
        platform: 'kick',
        points: { file: new Blob(['%PDF-1.7']), name: 'x.pdf' },
      }),
    )
    expect(pdf.status).toBe(415)
    const big = await failure(
      client.previewStreamlabs({
        platform: 'kick',
        points: { file: new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]), name: 'big.csv' },
      }),
    )
    expect([big.status, big.code]).toEqual([413, 'too_large'])
    const tipsNoCurrency = await failure(
      client.previewStreamlabs({
        tips: { file: csv('Date,Name,Amount\n2024-05-01,x,5\n'), name: 't.csv' },
      }),
    )
    expect(tipsNoCurrency.status).toBe(422)
  })
})

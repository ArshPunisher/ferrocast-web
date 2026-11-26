import { describe, expect, it, vi } from 'vitest'
import { BUILTINS } from '@ferrocast/designs'
import type { Overlay, ThemeDesign } from '@ferrocast/api'
import { themeIntoStudio } from './theme-studio'

const lofi = BUILTINS.find(
  (d): d is ThemeDesign => d.kind === 'theme' && d.id === 'builtin.lofi-loft',
)
if (!lofi) throw new Error('expected builtin.lofi-loft in @ferrocast/designs')

function overlayFor(theme: ThemeDesign, scene: string, overrides: Partial<Overlay> = {}): Overlay {
  const screen = theme.content.scenes.find((s) => s.key === scene)
  return {
    id: `ov-${scene}`,
    name: `${screen?.name ?? scene} (${theme.name})`,
    url: `http://127.0.0.1:4190/overlay/ov-${scene}`,
    width: 1920,
    height: 1080,
    widgets: [],
    updated_at: 1,
    design: { id: theme.id, scene, branded: theme.branded, follows: true },
    ...overrides,
  }
}

function fakeEngine(overrides: Partial<Parameters<typeof themeIntoStudio>[0]> = {}) {
  return {
    status: vi.fn(async () => ({ running: true })),
    scenes: vi.fn(async () => ({ current: 'Main', scenes: [{ name: 'Main' }] })),
    kinds: vi.fn(async () => ({ inputs: [{ id: 'ferrocast_web' }] })),
    sources: vi.fn(async () => [{ name: 'Main' }, { name: 'Camera' }]),
    addScene: vi.fn(async () => undefined),
    addExisting: vi.fn(async () => ({})),
    addSource: vi.fn(async () => ({})),
    setAudio: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('themeIntoStudio', () => {
  it('matches a single subset overlay by design.scene instead of positional index', async () => {
    const api = fakeEngine()
    const endingOnly = [overlayFor(lofi, 'ending')]

    const result = await themeIntoStudio(api, lofi, endingOnly)

    expect(result).toEqual({ scenes: ['Lo-fi loft · Ending'], skipped: null })
    expect(api.addScene).toHaveBeenCalledTimes(1)
    expect(api.addScene).toHaveBeenCalledWith('Lo-fi loft · Ending')
    // Ending is not a gameplay screen so Main must NOT be placed underneath.
    expect(api.addExisting).not.toHaveBeenCalled()
    expect(api.addSource).toHaveBeenCalledWith(
      'Lo-fi loft · Ending',
      expect.objectContaining({
        kind: 'ferrocast_web',
        name: 'Ending (Lo-fi loft)',
        settings: expect.objectContaining({ url: endingOnly[0]!.url }),
      }),
      true,
    )
  })

  it('pairs out-of-order subset overlays by design.scene and places gameplay scene under gameplay screens only', async () => {
    const api = fakeEngine()
    // Theme order puts just_chatting before brb; pass brb first to verify non-positional match.
    const subset = [overlayFor(lofi, 'brb'), overlayFor(lofi, 'just_chatting')]

    const result = await themeIntoStudio(api, lofi, subset)

    expect(result).toEqual({
      scenes: ['Lo-fi loft · Just chatting', 'Lo-fi loft · Be right back'],
      skipped: null,
    })
    expect(api.addExisting).toHaveBeenCalledTimes(1)
    expect(api.addExisting).toHaveBeenCalledWith('Lo-fi loft · Just chatting', 'Main')
    expect(api.addSource).toHaveBeenCalledWith(
      'Lo-fi loft · Just chatting',
      expect.objectContaining({
        settings: expect.objectContaining({
          url: 'http://127.0.0.1:4190/overlay/ov-just_chatting',
        }),
      }),
      true,
    )
    expect(api.addSource).toHaveBeenCalledWith(
      'Lo-fi loft · Be right back',
      expect.objectContaining({
        settings: expect.objectContaining({ url: 'http://127.0.0.1:4190/overlay/ov-brb' }),
      }),
      true,
    )
  })

  it('ignores overlays with missing or unknown design.scene and handles name collisions', async () => {
    const api = fakeEngine({
      scenes: vi.fn(async () => ({
        current: 'Main',
        scenes: [{ name: 'Main' }, { name: 'Lo-fi loft · In game' }],
      })),
    })
    const overlays = [
      overlayFor(lofi, 'missing_key', { id: 'ov-unknown', name: 'Unknown' }),
      overlayFor(lofi, 'in_game', { design: null, id: 'ov-null', name: 'No ref' }),
      overlayFor(lofi, 'in_game'),
    ]

    const result = await themeIntoStudio(api, lofi, overlays)

    expect(result).toEqual({ scenes: ['Lo-fi loft · In game 2'], skipped: null })
    expect(api.addExisting).toHaveBeenCalledWith('Lo-fi loft · In game 2', 'Main')
    expect(api.addSource).toHaveBeenCalledTimes(1)
    expect(api.addSource).toHaveBeenCalledWith(
      'Lo-fi loft · In game 2',
      expect.objectContaining({
        settings: expect.objectContaining({ url: 'http://127.0.0.1:4190/overlay/ov-in_game' }),
      }),
      true,
    )
  })

  it('skips when Studio is not running', async () => {
    const api = fakeEngine({ status: vi.fn(async () => ({ running: false })) })

    const result = await themeIntoStudio(api, lofi, [overlayFor(lofi, 'ending')])

    expect(result.scenes).toEqual([])
    expect(result.skipped).toMatch(/Start the Studio/)
    expect(api.addScene).not.toHaveBeenCalled()
  })
})

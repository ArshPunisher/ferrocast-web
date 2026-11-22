import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ApiError, type EngineScenes } from '@ferrocast/api'
import { DeskProvider, type Desk } from './common'
import {
  cellEffectiveInfo,
  gridStepCoord,
  parseNewDuration,
  sortMatrixRules,
  transitionSummary,
  TransitionsDialog,
} from './transitions'

let root: Root | null = null

function sampleScenes(): EngineScenes {
  return {
    scenes: [
      { name: 'Main', items: 2, current: true, preview: false, transition: null },
      {
        name: 'BRB',
        items: 1,
        current: false,
        preview: false,
        transition: { kind: 'cut_transition', ms: 0 },
        transition_name: 'Quick Cut',
      },
      { name: 'Outro', items: 1, current: false, preview: false, transition: null },
    ],
    current: 'Main',
    transition: { kind: 'fade_transition', ms: 300 },
    named_transitions: [
      { name: 'Smooth Fade', kind: 'fade_transition', ms: 300, settings: {}, default: true },
      { name: 'Quick Cut', kind: 'cut_transition', ms: 0, settings: {}, default: false },
      {
        name: 'Fast Swipe',
        kind: 'swipe_transition',
        ms: 450,
        settings: { direction: 'right' },
        default: false,
      },
    ],
    transition_matrix: [
      { from: null, to: 'BRB', transition: 'Quick Cut' },
      { from: 'Main', to: 'Outro', transition: 'Fast Swipe' },
    ],
  }
}

function makeDesk(
  overrides: Partial<Desk> = {},
  scenesData: EngineScenes | null = sampleScenes(),
): Desk {
  const api = {
    options: vi.fn().mockResolvedValue([]),
    defaults: vi.fn().mockResolvedValue({}),
    addNamedTransition: vi.fn().mockResolvedValue({
      name: 'Slide Up',
      kind: 'slide_transition',
      ms: 350,
      settings: {},
      default: false,
    }),
    updateNamedTransition: vi.fn().mockResolvedValue({
      name: 'Smooth Fade',
      kind: 'fade_transition',
      ms: 500,
      settings: {},
      default: true,
    }),
    renameNamedTransition: vi.fn().mockResolvedValue({
      name: 'Cinema Fade',
      kind: 'fade_transition',
      ms: 300,
      settings: {},
      default: true,
    }),
    duplicateNamedTransition: vi.fn().mockResolvedValue({
      name: 'Smooth Fade 2',
      kind: 'fade_transition',
      ms: 300,
      settings: {},
      default: false,
    }),
    setDefaultNamedTransition: vi.fn().mockResolvedValue(undefined),
    deleteNamedTransition: vi.fn().mockResolvedValue(undefined),
    setTransitionMatrixRule: vi.fn().mockResolvedValue(undefined),
  }
  return {
    api: api as unknown as Desk['api'],
    scenes: {
      data: scenesData,
      error: null,
      loading: scenesData === null,
      reload: vi.fn(),
      set: vi.fn(),
    } as unknown as Desk['scenes'],
    scene: 'Main',
    canvas: 'main',
    setCanvas: vi.fn(),
    size: { width: 1920, height: 1080 },
    pictureScenes: scenesData?.scenes ?? [],
    pictureCurrent: 'Main',
    allScenes: scenesData?.scenes ?? [],
    items: {
      data: [],
      error: null,
      loading: false,
      reload: vi.fn(),
      set: vi.fn(),
    } as unknown as Desk['items'],
    audio: {
      data: [],
      error: null,
      loading: false,
      reload: vi.fn(),
      set: vi.fn(),
    } as unknown as Desk['audio'],
    kinds: {
      data: { inputs: [], filters: [], transitions: [], encoders: [], outputs: [] },
      error: null,
      loading: false,
      reload: vi.fn(),
      set: vi.fn(),
    } as unknown as Desk['kinds'],
    prefs: {
      data: null,
      error: null,
      loading: false,
      reload: vi.fn(),
      set: vi.fn(),
    } as unknown as Desk['prefs'],
    refresh: vi.fn(),
    undone: 0,
    selected: null,
    select: vi.fn(),
    also: [],
    pickMore: vi.fn(),
    itemMenu: { current: null },
    editing: null,
    edit: vi.fn(),
    editTab: null,
    adding: null,
    setAdding: vi.fn(),
    stats: null,
    setStats: vi.fn(),
    clip: null,
    setClip: vi.fn(),
    filterClip: null,
    setFilterClip: vi.fn(),
    library: 0,
    bumpLibrary: vi.fn(),
    transforming: null,
    setTransforming: vi.fn(),
    transformClip: null,
    setTransformClip: vi.fn(),
    screens: {
      data: [],
      error: null,
      loading: false,
      reload: vi.fn(),
      set: vi.fn(),
    } as unknown as Desk['screens'],
    openSettings: vi.fn(),
    ...overrides,
  }
}

async function mountDialog(desk: Desk, tab: 'list' | 'matrix') {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <DeskProvider value={desk}>
        <TransitionsDialog initial={{ tab }} onClose={vi.fn()} />
      </DeskProvider>,
    )
  })
  return host
}

function findButton(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.getAttribute('aria-label') === name || b.textContent?.trim() === name,
  )
}

function findButtonMatching(re: RegExp): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    re.test(b.getAttribute('aria-label') ?? b.textContent ?? ''),
  )
}

function setInputValue(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelectValue(el: HTMLSelectElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
  set.call(el, value)
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
    onchange: null,
  })) as typeof window.matchMedia
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('transition helpers and matrix grid math', () => {
  it('computes grid navigation skipping diagonal self cells', () => {
    expect(gridStepCoord(1, 0, 4, 4, 'ArrowRight')).toEqual([1, 2])
    expect(gridStepCoord(1, 2, 4, 4, 'ArrowLeft')).toEqual([1, 0])
    expect(gridStepCoord(0, 1, 4, 4, 'ArrowDown')).toEqual([2, 1])
    expect(gridStepCoord(2, 1, 4, 4, 'ArrowUp')).toEqual([0, 1])
    expect(gridStepCoord(3, 1, 4, 4, 'End')).toEqual([3, 2])
    expect(gridStepCoord(0, 0, 4, 4, 'ArrowUp')).toBeNull()
  })

  it('summarizes transitions and computes effective matrix cells with precedence', () => {
    expect(transitionSummary({ kind: 'cut_transition', ms: 0 })).toBe('Cut')
    expect(transitionSummary({ kind: 'fade_transition', ms: 300 })).toBe('Fade, 300 ms')

    const s = sampleScenes()
    expect(cellEffectiveInfo(s, 'Main', 'Outro')).toMatchObject({
      directRule: 'Fast Swipe',
      effectiveName: 'Fast Swipe',
      via: 'pair',
    })
    expect(cellEffectiveInfo(s, 'Outro', 'BRB')).toMatchObject({
      directRule: null,
      effectiveName: 'Quick Cut',
      via: 'to',
    })
    expect(cellEffectiveInfo(s, 'Outro', 'Main')).toMatchObject({
      directRule: null,
      effectiveName: 'Smooth Fade',
      via: 'default',
    })
  })

  it('sorts matrix rules deterministically: pairs -> Any to scene -> scene to Any', () => {
    const sorted = sortMatrixRules(
      [
        { from: 'Main', to: null, transition: 'A' },
        { from: null, to: 'BRB', transition: 'B' },
        { from: 'Main', to: 'Outro', transition: 'C' },
      ],
      ['Main', 'BRB', 'Outro'],
    )
    expect(sorted.map((r) => `${r.from ?? '*'}->${r.to ?? '*'}`)).toEqual([
      'Main->Outro',
      '*->BRB',
      'Main->*',
    ])
  })
})

describe('TransitionsDialog UI', () => {
  it('renders loading skeleton while scenes load', async () => {
    const desk = makeDesk({}, null)
    await mountDialog(desk, 'list')
    expect(document.querySelector('[data-testid="transitions-loading"]')).toBeTruthy()
  })

  it('renders empty matrix banner when no rules exist and handles grid keyboard nav', async () => {
    const emptyData: EngineScenes = { ...sampleScenes(), transition_matrix: [] }
    const desk = makeDesk({}, emptyData)
    await mountDialog(desk, 'matrix')
    expect(document.querySelector('[data-testid="matrix-empty-notice"]')).toBeTruthy()
    const cell = findButtonMatching(/From Any to Main:/i)!
    expect(cell).toBeTruthy()
    await act(async () => {
      cell.focus()
      cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(document.activeElement?.textContent).toContain('From Any to BRB:')
  })

  it('handles add, rename, duplicate, default, mobile rule creation, and error banner', async () => {
    const desk = makeDesk()
    const apiMock = desk.api as unknown as {
      addNamedTransition: ReturnType<typeof vi.fn>
      renameNamedTransition: ReturnType<typeof vi.fn>
      duplicateNamedTransition: ReturnType<typeof vi.fn>
      setDefaultNamedTransition: ReturnType<typeof vi.fn>
      setTransitionMatrixRule: ReturnType<typeof vi.fn>
    }
    apiMock.addNamedTransition.mockRejectedValueOnce(
      new ApiError(
        409,
        'studio_name_taken',
        'There is already a transition called "Smooth Fade".',
        'Pick another transition name.',
      ),
    )
    await mountDialog(desk, 'list')

    // Attempt duplicate name -> inline alert appears with plain error + hint.
    await act(async () => findButton('New transition')!.click())
    const nameInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="New transition name"]',
    )!
    await act(async () => setInputValue(nameInput, 'Smooth Fade'))
    await act(async () => findButton('Add')!.click())
    const alert = document.querySelector('[role="alert"]')
    expect(alert).toBeTruthy()
    expect(alert!.textContent).toContain('Pick another transition name.')

    // Valid duplicate, rename, and default calls.
    await act(async () => findButton('Duplicate Smooth Fade')!.click())
    expect(apiMock.duplicateNamedTransition).toHaveBeenCalledWith('Smooth Fade')

    await act(async () => findButton('Rename Smooth Fade')!.click())
    const renameInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Rename Smooth Fade"]',
    )!
    await act(async () => setInputValue(renameInput, 'Cinema Fade'))
    await act(async () => findButton('Save')!.click())
    expect(apiMock.renameNamedTransition).toHaveBeenCalledWith('Smooth Fade', 'Cinema Fade')

    await act(async () => findButton('Set Quick Cut as default')!.click())
    expect(apiMock.setDefaultNamedTransition).toHaveBeenCalledWith('Quick Cut')

    // Switch to Matrix tab via Segmented radio control and submit a mobile matrix rule.
    const matrixRadio = [
      ...document.querySelectorAll<HTMLLabelElement>(
        '[role="radiogroup"][aria-label="Transitions view"] label',
      ),
    ]
      .find((l) => l.textContent === 'Transition matrix')!
      .querySelector<HTMLInputElement>('input')!
    await act(async () => matrixRadio.click())

    const fromSelect = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Rule From scene"]',
    )!
    const toSelect = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Rule To scene"]',
    )!
    await act(async () => {
      setSelectValue(fromSelect, 'BRB')
      setSelectValue(toSelect, 'Main')
    })
    await act(async () => findButton('Save matrix rule')!.click())
    expect(apiMock.setTransitionMatrixRule).toHaveBeenCalledWith({
      from: 'BRB',
      to: 'Main',
      transition: 'Smooth Fade',
    })
  })
})

describe('parseNewDuration', () => {
  it('keeps a real 0, rounds decimals, clamps, and falls back only for nothing or text', () => {
    expect(parseNewDuration('0')).toBe(0)
    expect(parseNewDuration('350.6')).toBe(351)
    expect(parseNewDuration('99999')).toBe(20000)
    expect(parseNewDuration('-5')).toBe(0)
    expect(parseNewDuration('')).toBe(300)
    expect(parseNewDuration('  ')).toBe(300)
    expect(parseNewDuration('abc')).toBe(300)
  })
})

describe('cellEffectiveInfo inherited name', () => {
  it("names what clearing the cell would play, not the cell's own rule", () => {
    const scenes = {
      scenes: [
        { name: 'Intro', items: 1, current: true, preview: false, transition: null },
        { name: 'Main', items: 1, current: false, preview: false, transition: null },
      ],
      current: 'Intro',
      transition: { kind: 'fade_transition', ms: 300 },
      named_transitions: [
        { name: 'Fade', kind: 'fade_transition', ms: 300, settings: {}, default: true },
        { name: 'Stinger', kind: 'obs_stinger_transition', ms: 0, settings: {}, default: false },
        { name: 'Swipe', kind: 'swipe_transition', ms: 400, settings: {}, default: false },
      ],
      transition_matrix: [
        { from: 'Intro', to: 'Main', transition: 'Stinger' },
        { from: null, to: 'Main', transition: 'Swipe' },
      ],
    } as unknown as EngineScenes
    const info = cellEffectiveInfo(scenes, 'Intro', 'Main')
    expect(info.directRule).toBe('Stinger')
    expect(info.effectiveName).toBe('Stinger')
    expect(info.inheritedName).toBe('Swipe')
  })
})

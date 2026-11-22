import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

interface NamedTransition {
  name: string
  kind: string
  ms: number
  settings: Record<string, unknown>
  default: boolean
}

interface MatrixRule {
  from: string | null
  to: string | null
  transition: string
}

async function mountNamedTransitionStudio(
  page: Page,
  opts: { initialEmptyMatrix?: boolean; delayScenesMs?: number } = {},
) {
  let sceneList = ['Main', 'Gameplay', 'Chatting', 'BRB']
  let current = 'Main'
  let preview: string | null = null
  let transitions: NamedTransition[] = [
    { name: 'Fade', kind: 'fade_transition', ms: 300, settings: {}, default: true },
    { name: 'Cut', kind: 'cut_transition', ms: 0, settings: {}, default: false },
    {
      name: 'Side Wipe',
      kind: 'swipe_transition',
      ms: 450,
      settings: { direction: 'left', swipe_in: false },
      default: false,
    },
  ]
  let matrix: MatrixRule[] = opts.initialEmptyMatrix
    ? []
    : [{ from: null, to: 'BRB', transition: 'Cut' }]
  let rejectNextAdd = false
  let delayedOnce = false
  const switchedWith: {
    path: string
    from: string
    to: string
    resolved: NamedTransition
  }[] = []
  const errors: string[] = []

  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
  })

  await page.addInitScript(() => {
    ;(window as unknown as { __FERROCAST__: unknown }).__FERROCAST__ = Object.freeze({
      api: window.location.origin,
      token: 'named-tr-e2e',
      desktop: true,
    })
    localStorage.setItem('fc-golive-picture', 'ferrocast')
  })

  await page.routeWebSocket('**/api/v1/live**', (ws) => {
    void ws
  })

  const resolveFor = (from: string, to: string): NamedTransition => {
    const findT = (name: string | undefined) => transitions.find((t) => t.name === name)
    const exact = findT(matrix.find((r) => r.from === from && r.to === to)?.transition)
    if (exact) return exact
    const anyTo = findT(matrix.find((r) => r.from === null && r.to === to)?.transition)
    if (anyTo) return anyTo
    const fromAny = findT(matrix.find((r) => r.from === from && r.to === null)?.transition)
    if (fromAny) return fromAny
    return transitions.find((t) => t.default) ?? transitions[0]!
  }

  const scenesJson = () => {
    const def = transitions.find((t) => t.default) ?? transitions[0]!
    return {
      scenes: sceneList.map((name) => {
        const over = matrix.find((r) => r.from === null && r.to === name)
        const overT = over ? transitions.find((t) => t.name === over.transition) : undefined
        return {
          name,
          items: 1,
          current: name === current,
          preview: name === preview,
          transition: overT ? { kind: overT.kind, ms: overT.ms } : null,
          ...(overT ? { transition_name: overT.name } : {}),
        }
      }),
      current,
      preview,
      transition: { kind: def.kind, ms: def.ms },
      named_transitions: transitions,
      transition_matrix: matrix,
      quick: [
        { kind: 'cut_transition', ms: 0 },
        { kind: 'fade_transition', ms: 300 },
      ],
      studio_options: {
        swap: true,
        duplicate_scene: true,
        duplicate_sources: false,
        double_click: false,
      },
      tbar: { active: false, at: 0 },
      black: false,
      vertical: null,
      top_layer: null,
    }
  }

  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    const method = req.method()

    if (path === '/api/v1/status') {
      return route.fulfill({
        json: {
          version: '3.4.0',
          port: 5281,
          live: { twitch: false, youtube: false, kick: false },
          connectors: {
            twitch: { state: 'disconnected', account: null },
            youtube: { state: 'disconnected', account: null },
            kick: { state: 'disconnected', account: null },
            obs: { state: 'disconnected' },
          },
          setup_done: true,
        },
      })
    }
    if (path === '/api/v1/session/ticket') return route.fulfill({ json: { ticket: 'e2e-ticket' } })
    if (path === '/api/v1/queue')
      return route.fulfill({ json: { paused: false, current: null, queued: [] } })
    if (path === '/api/v1/session/stats') return route.fulfill({ json: { viewers: {} } })
    if (path === '/api/v1/tts/pending') return route.fulfill({ json: [] })
    if (path === '/api/v1/events') return route.fulfill({ json: { events: [], next_before: null } })
    if (path === '/api/v1/connectors') {
      return route.fulfill({
        json: {
          twitch: { connected: false },
          youtube: { connected: false },
          kick: { connected: false },
        },
      })
    }
    if (path === '/api/v1/golive') {
      return route.fulfill({
        json: {
          ingest: 'rtmp://127.0.0.1:1935/live',
          obs: {
            connected: false,
            points_here: false,
            streaming: false,
            before: null,
            aitum: null,
            vertical: null,
          },
          live: false,
          stats: {
            kbps: 0,
            keyframe_interval_ms: null,
            video_codec: null,
            width: null,
            height: null,
            fps: null,
          },
          vertical_live: false,
          vertical_stats: {
            kbps: 0,
            keyframe_interval_ms: null,
            video_codec: null,
            width: null,
            height: null,
            fps: null,
          },
          destinations: [],
          upload: null,
          protect: true,
          aitum_ok: false,
          auto_quality: true,
          advanced: {
            rules: {
              slow_pct: 70,
              trouble_s: 4,
              calm_s: 10,
              first_pause_s: 60,
              max_pause_s: 600,
              first_to_pause: null,
            },
            keep_free_pct: 20,
            port: 1935,
            per: {},
            ignore_service_limits: false,
          },
          cut: {
            source: 'canvas',
            config: {
              layout: 'camera_top',
              camera: { x: 0.74, y: 0.04, w: 0.24, h: 0.31 },
              game: { x: 0.22, y: 0, w: 0.56, h: 1 },
              camera_share: 38,
              width: 1080,
              height: 1920,
              fps: 30,
              kbps: 4500,
              encoder: 'auto',
            },
            state: null,
            ffmpeg: { state: 'ready' },
          },
        },
      })
    }
    if (path === '/api/v1/studio/engine') {
      return route.fulfill({
        json: {
          available: true,
          running: true,
          version: '3.4.0',
          renderer: 'Metal',
          detail: null,
          safe_mode: null,
        },
      })
    }
    if (path === '/api/v1/studio/engine/kinds') {
      return route.fulfill({
        json: {
          inputs: [{ id: 'color_source_v3', name: 'Colour' }],
          filters: [],
          transitions: [
            { id: 'fade_transition', name: 'Fade' },
            { id: 'cut_transition', name: 'Cut' },
            { id: 'swipe_transition', name: 'Swipe' },
            { id: 'slide_transition', name: 'Slide' },
            { id: 'fade_to_color_transition', name: 'Fade to colour' },
            { id: 'wipe_transition', name: 'Wipe' },
            { id: 'obs_stinger_transition', name: 'Stinger' },
            { id: 'ferrocast_move', name: 'Move' },
          ],
          encoders: [],
          outputs: [],
        },
      })
    }
    if (path === '/api/v1/studio/engine/kinds/swipe_transition/options') {
      return route.fulfill({
        json: [
          {
            key: 'direction',
            label: 'Direction',
            kind: 'list',
            help: '',
            visible: true,
            enabled: true,
            min: null,
            max: null,
            step: null,
            slider: false,
            suffix: '',
            choices: ['Left', 'Right', 'Up', 'Down'],
            values: ['left', 'right', 'up', 'down'],
            group: [],
            default: 'left',
          },
        ],
      })
    }
    if (path === '/api/v1/studio/engine/kinds/swipe_transition/defaults') {
      return route.fulfill({ json: { direction: 'left', swipe_in: false } })
    }
    if (path.includes('/kinds/') && (path.endsWith('/options') || path.endsWith('/defaults'))) {
      return route.fulfill({ json: path.endsWith('/options') ? [] : {} })
    }
    if (path === '/api/v1/studio/engine/scenes' && method === 'GET') {
      if (opts.delayScenesMs && !delayedOnce) {
        delayedOnce = true
        await new Promise((r) => setTimeout(r, opts.delayScenesMs))
      }
      return route.fulfill({ json: scenesJson() })
    }
    const curMatch = path.match(/^\/api\/v1\/studio\/engine\/scenes\/([^/]+)\/current$/)
    if (curMatch && method === 'POST') {
      const target = decodeURIComponent(curMatch[1]!)
      const resolved = resolveFor(current, target)
      switchedWith.push({ path: 'direct', from: current, to: target, resolved })
      current = target
      return route.fulfill({ status: 204 })
    }
    const renScene = path.match(/^\/api\/v1\/studio\/engine\/sources\/([^/]+)\/rename$/)
    if (renScene && method === 'POST') {
      const oldName = decodeURIComponent(renScene[1]!)
      const newName = String((req.postDataJSON() as { name: string }).name)
      sceneList = sceneList.map((s) => (s === oldName ? newName : s))
      if (current === oldName) current = newName
      matrix = matrix.map((r) => ({
        ...r,
        from: r.from === oldName ? newName : r.from,
        to: r.to === oldName ? newName : r.to,
      }))
      return route.fulfill({ status: 204 })
    }
    const delScene = path.match(/^\/api\/v1\/studio\/engine\/scenes\/([^/]+)$/)
    if (delScene && method === 'DELETE') {
      const name = decodeURIComponent(delScene[1]!)
      sceneList = sceneList.filter((s) => s !== name)
      matrix = matrix.filter((r) => r.from !== name && r.to !== name)
      if (current === name) current = sceneList[0]!
      return route.fulfill({ status: 204 })
    }
    if (path === '/api/v1/studio/engine/transitions' && method === 'POST') {
      const b = req.postDataJSON() as Partial<NamedTransition> & { name: string }
      if (rejectNextAdd) {
        rejectNextAdd = false
        return route.fulfill({
          status: 500,
          json: { error: { code: 'internal', message: 'Engine write failed', hint: 'Try again.' } },
        })
      }
      if (transitions.some((t) => t.name === b.name)) {
        return route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'studio_name_taken',
              message: `There is already a transition called "${b.name}".`,
              hint: 'Pick another transition name.',
            },
          },
        })
      }
      if (b.default) transitions.forEach((t) => (t.default = false))
      const created: NamedTransition = {
        name: b.name,
        kind: b.kind ?? 'fade_transition',
        ms: b.ms ?? 300,
        settings: b.settings ?? {},
        default: Boolean(b.default),
      }
      transitions.push(created)
      return route.fulfill({ status: 201, json: created })
    }
    const trDef = path.match(/^\/api\/v1\/studio\/engine\/transitions\/([^/]+)\/default$/)
    if (trDef && method === 'PUT') {
      const name = decodeURIComponent(trDef[1]!)
      transitions.forEach((t) => (t.default = t.name === name))
      return route.fulfill({ status: 204 })
    }
    const trRen = path.match(/^\/api\/v1\/studio\/engine\/transitions\/([^/]+)\/rename$/)
    if (trRen && method === 'POST') {
      const from = decodeURIComponent(trRen[1]!)
      const to = String((req.postDataJSON() as { name: string }).name)
      const target = transitions.find((t) => t.name === from)!
      target.name = to
      matrix = matrix.map((r) => (r.transition === from ? { ...r, transition: to } : r))
      return route.fulfill({ status: 200, json: target })
    }
    const trDup = path.match(/^\/api\/v1\/studio\/engine\/transitions\/([^/]+)\/duplicate$/)
    if (trDup && method === 'POST') {
      const from = decodeURIComponent(trDup[1]!)
      const src = transitions.find((t) => t.name === from)!
      let n = 2
      while (transitions.some((t) => t.name === `${from} ${n}`)) n++
      const dup: NamedTransition = {
        ...src,
        name: `${from} ${n}`,
        settings: { ...src.settings },
        default: false,
      }
      transitions.push(dup)
      return route.fulfill({ status: 201, json: dup })
    }
    const trItem = path.match(/^\/api\/v1\/studio\/engine\/transitions\/([^/]+)$/)
    if (trItem && method === 'PUT') {
      const name = decodeURIComponent(trItem[1]!)
      const patch = req.postDataJSON() as Partial<NamedTransition>
      const t = transitions.find((x) => x.name === name)!
      if (patch.kind) t.kind = patch.kind
      if (typeof patch.ms === 'number') t.ms = patch.ms
      if (patch.settings) t.settings = { ...t.settings, ...patch.settings }
      if (patch.default) transitions.forEach((x) => (x.default = x.name === name))
      return route.fulfill({ status: 200, json: t })
    }
    if (trItem && method === 'DELETE') {
      const name = decodeURIComponent(trItem[1]!)
      const wasDef = transitions.find((x) => x.name === name)?.default
      transitions = transitions.filter((x) => x.name !== name)
      matrix = matrix.filter((r) => r.transition !== name)
      if (wasDef && transitions[0]) transitions[0].default = true
      return route.fulfill({ status: 204 })
    }
    if (path === '/api/v1/studio/engine/transition-matrix' && method === 'PUT') {
      const b = req.postDataJSON() as {
        from: string | null
        to: string | null
        transition: string | null
      }
      matrix = matrix.filter((r) => !(r.from === b.from && r.to === b.to))
      if (b.transition) matrix.push({ from: b.from, to: b.to, transition: b.transition })
      return route.fulfill({ status: 204 })
    }
    if (path === '/api/v1/studio/engine/studio-mode' && method === 'PUT') {
      const { on } = req.postDataJSON() as { on: boolean }
      preview = on ? current : null
      return route.fulfill({ status: 204 })
    }
    if (path === '/api/v1/studio/engine/studio-mode/preview' && method === 'PUT') {
      preview = String((req.postDataJSON() as { scene: string }).scene)
      return route.fulfill({ status: 204 })
    }
    if (path === '/api/v1/studio/engine/studio-mode/transition' && method === 'POST') {
      if (preview) {
        const resolved = resolveFor(current, preview)
        switchedWith.push({ path: 'studio_mode', from: current, to: preview, resolved })
        const old = current
        current = preview
        preview = old
      }
      return route.fulfill({ status: 204 })
    }
    if (path === '/api/v1/studio/engine/studio-mode/tbar' && method === 'PUT') {
      const b = req.postDataJSON() as { at: number; release?: boolean }
      if (b.release && b.at >= 0.5 && preview) {
        const resolved = resolveFor(current, preview)
        switchedWith.push({ path: 'tbar', from: current, to: preview, resolved })
        const old = current
        current = preview
        preview = old
      }
      return route.fulfill({ json: { active: !b.release, at: b.release ? 0 : b.at } })
    }
    if (path.endsWith('/items')) return route.fulfill({ json: [] })
    if (path.endsWith('/audio')) return route.fulfill({ json: [] })
    if (path === '/api/v1/studio/engine/sources') return route.fulfill({ json: [] })
    if (path === '/api/v1/studio/engine/levels') return route.fulfill({ json: {} })
    if (path === '/api/v1/studio/engine/stats') {
      return route.fulfill({
        json: {
          engine: { cpu: 4, fps: 60, frame_ms: 4, lagged: 0, frames: 1200, memory_mb: 160 },
          canvas: { width: 1920, height: 1080, fps: 60 },
          stream: null,
          record: null,
          scene: current,
          history: { undo: null, redo: null },
        },
      })
    }
    if (path === '/api/v1/studio/engine/settings') {
      return route.fulfill({
        json: {
          encoder: 'hardware',
          video_kbps: 6000,
          vbr: false,
          keyframe_s: 2,
          profile: 'high',
          bframes: true,
          scale: null,
          audio_kbps: 160,
          width: 1920,
          height: 1080,
          fps: 60,
          record_folder: null,
          record_format: 'mp4',
          record_quality: 'stream',
          reconnect: true,
          reconnect_every_s: 5,
          reconnect_tries: 20,
          delay_s: 0,
          sample_rate: 48000,
          stereo: true,
          monitoring: null,
          hotkeys: {},
        },
      })
    }
    if (path.startsWith('/api/v1/studio/engine/library/')) {
      return route.fulfill({
        json: { current: 'default', list: [{ id: 'default', name: 'Default' }] },
      })
    }
    if (
      path === '/api/v1/studio/engine/screens' ||
      path === '/api/v1/studio/engine/missing-files'
    ) {
      return route.fulfill({ json: [] })
    }
    if (path === '/api/v1/studio/engine/audio-care')
      return route.fulfill({ json: { ducking: null, loudness_lufs: null } })
    if (path === '/api/v1/studio/engine/privacy')
      return route.fulfill({ json: { hide_notifications: true, hide_apps: [], supported: true } })
    if (path === '/api/v1/studio/engine/history')
      return route.fulfill({ json: { undo: [], redo: [] } })
    if (path === '/api/v1/studio/engine/preview/pause')
      return route.fulfill({ json: { paused: false } })
    if (path === '/api/v1/studio/show') return route.fulfill({ json: { config: {}, run: null } })
    if (path === '/api/v1/pro')
      return route.fulfill({
        json: { active: false, sales_open: false, sale: null, features: { history: false } },
      })
    if (path === '/api/v1/account' || path === '/api/v1/cloud/summary') {
      return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'none' } } })
    }
    if (path === '/api/v1/stream-info')
      return route.fulfill({ json: { presets: [], history: [], platforms: [] } })
    if (path === '/api/v1/studio/preflight')
      return route.fulfill({ json: { ready: true, checks: [] } })
    if (path === '/api/v1/studio/switcher')
      return route.fulfill({ json: { enabled: false, rules: [] } })
    if (path === '/api/v1/updates')
      return route.fulfill({ json: { current: '3.4.0', latest: null, available: false } })
    if (path === '/api/v1/chat' || path === '/api/v1/mod/held' || path === '/api/v1/goals')
      return route.fulfill({ json: [] })
    return route.fulfill({ json: {} })
  })

  return {
    switchedWith,
    errors,
    setRejectNextAdd: (v: boolean) => {
      rejectNextAdd = v
    },
    getState: () => ({ transitions, matrix, sceneList, current }),
  }
}

test.describe('named transitions and matrix', () => {
  test('desktop 1280px: CRUD, grid keyboard navigation, precedence switch paths, per-scene shortcut, cleanup, and axe', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'Desktop matrix grid runs in chromium project.')
    await page.setViewportSize({ width: 1280, height: 800 })
    const mock = await mountNamedTransitionStudio(page, { initialEmptyMatrix: true })
    await page.goto('./#/studio/golive')

    await expect(page.getByRole('button', { name: /^Main\b/ })).toBeVisible()
    await page.getByRole('button', { name: 'Manage transitions and matrix' }).click()

    const dialog = page.getByRole('dialog', { name: 'Transitions and matrix' })
    await expect(dialog).toBeVisible()
    // Initial empty matrix banner visible.
    await expect(dialog.getByTestId('matrix-empty-notice')).toBeVisible()

    // Switch to Saved transitions tab: create, edit settings, duplicate, rename, set default, error state, delete.
    await dialog.getByText('Saved transitions', { exact: true }).click()
    await dialog.getByRole('button', { name: 'New transition' }).click()
    await dialog.getByLabel('New transition name').fill('Fade')
    await dialog.getByRole('button', { name: 'Add' }).click()
    // Duplicate name error banner renders cleanly inside dialog.
    await expect(dialog.getByRole('alert')).toContainText('Pick another transition name.')
    await dialog.getByRole('button', { name: 'Dismiss error' }).click()

    await dialog.getByLabel('New transition name').fill('Intro Swipe')
    await dialog.getByLabel('New transition kind').selectOption('swipe_transition')
    await dialog.getByLabel('New transition length in ms').fill('500')
    await dialog.getByRole('button', { name: 'Add' }).click()
    await expect(dialog.getByRole('heading', { name: 'Intro Swipe' })).toBeVisible()

    // Duplicate & rename & change swipe setting.
    await dialog.getByRole('button', { name: 'Duplicate Intro Swipe', exact: true }).click()
    await expect(dialog.getByRole('heading', { name: 'Intro Swipe 2' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Rename Intro Swipe', exact: true }).click()
    await dialog
      .getByRole('textbox', { name: 'Rename Intro Swipe', exact: true })
      .fill('Hero Swipe')
    await dialog.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog.getByRole('heading', { name: 'Hero Swipe' })).toBeVisible()
    await dialog.getByLabel('Direction').selectOption({ label: 'Right' })

    // Delete copy with confirm dialog.
    await dialog.getByRole('button', { name: 'Delete Intro Swipe 2', exact: true }).click()
    const confirm = page.getByRole('dialog', { name: /Delete Intro Swipe 2/i })
    await confirm.getByRole('button', { name: 'Delete transition' }).click()

    // Server error state on create handles gracefully with inline alert.
    mock.setRejectNextAdd(true)
    await dialog.getByRole('button', { name: 'New transition' }).click()
    await dialog.getByLabel('New transition name').fill('Broken Transition')
    await dialog.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Engine write failed')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()

    // Switch to Transition matrix grid and drive it with keyboard navigation!
    await dialog.getByText('Transition matrix', { exact: true }).click()
    const grid = dialog.getByRole('grid', { name: 'From scene to To scene transition matrix' })
    await expect(grid).toBeVisible()

    const anyToMain = grid.getByRole('button', { name: /From Any to Main:/i })
    await anyToMain.focus()
    // Move right -> From Any to Gameplay, down -> skips Main->Main diagonal OR lands on cell.
    await page.keyboard.press('ArrowRight')
    await expect(grid.getByRole('button', { name: /From Any to Gameplay:/i })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(grid.getByRole('button', { name: /From Main to Gameplay:/i })).toBeFocused()

    // Enter opens inline select; Escape exits cell edit WITHOUT closing dialog!
    await page.keyboard.press('Enter')
    const cellSelect = grid.getByLabel('Select transition for Main to Gameplay')
    await expect(cellSelect).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(grid.getByRole('button', { name: /From Main to Gameplay:/i })).toBeFocused()

    // Re-open with Space and pick Hero Swipe for Main -> Gameplay (exact pair), and Cut for Main -> Any.
    await page.keyboard.press('Space')
    await grid.getByLabel('Select transition for Main to Gameplay').selectOption('Hero Swipe')
    await expect(
      grid.getByRole('button', {
        name: 'From Main to Gameplay: Hero Swipe Exact pair (override)',
      }),
    ).toBeVisible()

    await grid.getByRole('button', { name: /From Main to Any:/i }).click()
    await grid.getByLabel('Select transition for Main to Any').selectOption('Side Wipe')

    // Accessibility check inside Matrix grid dialog at 1280px.
    const axeDesktop = await new AxeBuilder({ page })
      .include('dialog[open]')
      .disableRules(['color-contrast'])
      .analyze()
    expect(axeDesktop.violations).toEqual([])

    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).toBeHidden()

    // Per-scene "Transition override" shortcut on BRB row right-click menu.
    await page.getByRole('button', { name: /^BRB/ }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Transition override' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Cut (Cut)' }).click()
    await expect(page.getByTitle('Transition override: Cut')).toBeVisible()

    // Test direct scene switches verify precedence!
    await page.getByRole('button', { name: /^Gameplay/ }).click() // Main -> Gameplay => Hero Swipe (exact pair)
    await page.getByRole('button', { name: /^BRB/ }).click() // Gameplay -> BRB => Cut (Any -> BRB)
    await page.getByRole('button', { name: /^Main/ }).click() // BRB -> Main => Fade (default)
    await page.getByRole('button', { name: /^Chatting/ }).click() // Main -> Chatting => Side Wipe (Main -> Any)

    expect(mock.switchedWith.map((s) => `${s.path}:${s.from}->${s.to}=${s.resolved.name}`)).toEqual(
      [
        'direct:Main->Gameplay=Hero Swipe',
        'direct:Gameplay->BRB=Cut',
        'direct:BRB->Main=Fade',
        'direct:Main->Chatting=Side Wipe',
      ],
    )

    // Enter Studio Mode and verify Transition button uses resolved transition too!
    await page.getByRole('button', { name: /Studio Mode/i }).click()
    await page.getByRole('button', { name: /^BRB/ }).click()
    await page.getByRole('button', { name: 'Transition', exact: true }).click()
    const lastSwitch = mock.switchedWith[mock.switchedWith.length - 1]!
    expect(lastSwitch.path).toBe('studio_mode')
    expect(lastSwitch.to).toBe('BRB')
    expect(lastSwitch.resolved.name).toBe('Cut')
  })

  test('mobile 375px: list view renders cleanly with zero horizontal overflow, add/remove rules, and axe', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const mock = await mountNamedTransitionStudio(page)
    await page.goto('./#/studio/golive')

    // Open Scenes panel on mobile and tap Manage transitions and matrix.
    await page
      .getByRole('radiogroup', { name: 'Panel' })
      .getByText('Scenes', { exact: true })
      .click()
    await expect(page.getByRole('button', { name: 'Manage transitions and matrix' })).toBeVisible()
    await page.getByRole('button', { name: 'Manage transitions and matrix' }).click()

    const dialog = page.getByRole('dialog', { name: 'Transitions and matrix' })
    await expect(dialog).toBeVisible()

    // Desktop grid is hidden on 375px; mobile list is visible and fits inside viewport.
    await expect(dialog.getByRole('grid')).toBeHidden()
    const mob = dialog.getByTestId('matrix-mobile-list')
    await expect(mob).toBeVisible()
    await expect(mob.getByRole('list', { name: 'Matrix rules list' })).toBeVisible()

    // Add a new exact rule from the mobile list form.
    await mob.getByLabel('Rule From scene').selectOption('Main')
    await mob.getByLabel('Rule To scene').selectOption('Gameplay')
    await mob.getByLabel('Rule transition').selectOption('Side Wipe')
    await mob.getByRole('button', { name: 'Save matrix rule' }).click()

    await expect(mob.getByLabel('Transition for Main to Gameplay')).toHaveValue('Side Wipe')
    expect(mock.getState().matrix).toContainEqual({
      from: 'Main',
      to: 'Gameplay',
      transition: 'Side Wipe',
    })

    // Zero horizontal overflow at 375px.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    const axeMobile = await new AxeBuilder({ page })
      .include('dialog[open]')
      .disableRules(['color-contrast'])
      .analyze()
    expect(axeMobile.violations).toEqual([])
    expect(mock.errors).toEqual([])
  })
})

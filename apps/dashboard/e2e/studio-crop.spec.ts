import { expect, test, type Page } from '@playwright/test'
import type { EngineItem, EngineTransform } from '@ferrocast/api'
import { demo, open } from './helpers'

// W2 regression test: Alt+drag crop in the Studio preview against the real demo engine.
// Verifies immediate crop cursor on Alt keydown/keyup (never crosshair) and dragging all 4
// edges and 4 corners while keeping the opposite uncropped edge fixed on canvas.

async function openRunningStudio(page: Page) {
  await page.addInitScript(() => {
    ;(window as unknown as { __FERROCAST__: unknown }).__FERROCAST__ = { desktop: true }
    localStorage.setItem('fc-golive-picture', 'ferrocast')
  })
  await open(page, 'studio/golive', 'autoplay=0&latency=0&studioEngine=1')
  await page.getByRole('button', { name: 'Start the Studio' }).click()
  await expect(page.locator('[data-canvas-box]').first()).toBeVisible()
}

async function readWebcamState(page: Page): Promise<{ item: EngineItem; tr: EngineTransform }> {
  return demo<{ item: EngineItem; tr: EngineTransform }>(
    page,
    `(d) => {
      const se = d.studioEngine
      if (!se) throw new Error('studioEngine missing')
      const items = se.route('GET', ['studio', 'engine', 'scenes', 'Main', 'items'], undefined)
      const flat = items.flatMap((i) => [i, ...(i.children ?? [])])
      const cam = flat.find((i) => i.name === 'Webcam')
      if (!cam) throw new Error('Webcam item missing')
      const tr = se.route('GET', ['studio', 'engine', 'scenes', 'Main', 'items', String(cam.id), 'transform'], undefined)
      return { item: cam, tr }
    }`,
  )
}

async function resetWebcam(page: Page): Promise<void> {
  await demo(
    page,
    `(d) => {
      const se = d.studioEngine
      if (!se) throw new Error('studioEngine missing')
      const items = se.route('GET', ['studio', 'engine', 'scenes', 'Main', 'items'], undefined)
      const flat = items.flatMap((i) => [i, ...(i.children ?? [])])
      const cam = flat.find((i) => i.name === 'Webcam')
      if (!cam) throw new Error('Webcam item missing')
      const tr = se.route('GET', ['studio', 'engine', 'scenes', 'Main', 'items', String(cam.id), 'transform'], undefined)
      se.route('PUT', ['studio', 'engine', 'scenes', 'Main', 'items', String(cam.id), 'transform'], {
        ...tr,
        x: 960,
        y: 540,
        scale_x: 1,
        scale_y: 1,
        alignment: 5,
        bounds: 'stretch',
        bounds_alignment: 5,
        bounds_width: 480,
        bounds_height: 270,
        crop_left: 0,
        crop_top: 0,
        crop_right: 0,
        crop_bottom: 0,
      })
    }`,
  )
  // Bounce Main -> Starting Soon -> Main so the stage refreshes its item frame from the engine, then pick Webcam.
  const scenes = page.getByRole('region', { name: 'Scenes' })
  await scenes.getByRole('button', { name: /^Starting Soon\b/ }).click()
  await scenes.getByRole('button', { name: /^Main\b/ }).click()
  await page.getByRole('button', { name: 'Webcam', exact: true }).click()
}

async function stageHelper(page: Page) {
  const canvas = page.locator('[data-canvas-box]').first()
  const stage = canvas.locator('..')
  const box = (await canvas.boundingBox())!
  const scale = box.width / 1920
  return {
    stage,
    at: (cx: number, cy: number) => ({ x: box.x + cx * scale, y: box.y + cy * scale }),
    scale,
  }
}

async function altDragCanvas(
  page: Page,
  at: (cx: number, cy: number) => { x: number; y: number },
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const a = at(from.x, from.y)
  const b = at(to.x, to.y)
  await page.mouse.move(a.x, a.y)
  await page.keyboard.down('Alt')
  await page.mouse.down()
  for (let s = 1; s <= 6; s++) {
    await page.mouse.move(a.x + ((b.x - a.x) * s) / 6, a.y + ((b.y - a.y) * s) / 6)
  }
  await page.mouse.up()
  await page.keyboard.up('Alt')
  await page.waitForTimeout(80)
}

test.describe('Studio preview Alt+drag cropping', () => {
  test('switches cursor immediately on Alt press/release over handles and never uses crosshair', async ({
    page,
  }) => {
    await openRunningStudio(page)
    await resetWebcam(page)

    const { stage, at } = await stageHelper(page)
    const leftHandle = at(960, 675)
    await page.mouse.move(leftHandle.x, leftHandle.y)
    await expect.poll(() => stage.evaluate((el) => el.style.cursor)).toBe('ew-resize')

    // Press Alt WITHOUT moving the mouse: cursor must change at once to SVG crop cursor, never crosshair.
    await page.keyboard.down('Alt')
    await expect
      .poll(() => stage.evaluate((el) => el.style.cursor))
      .toContain('url("data:image/svg+xml,')
    const duringAlt = await stage.evaluate((el) => el.style.cursor)
    expect(duringAlt).not.toBe('crosshair')

    // Release Alt WITHOUT moving the mouse: cursor returns immediately to ew-resize.
    await page.keyboard.up('Alt')
    await expect.poll(() => stage.evaluate((el) => el.style.cursor)).toBe('ew-resize')

    // Hovering inside the source with Alt held must show move, never crosshair.
    const middle = at(1200, 675)
    await page.mouse.move(middle.x, middle.y)
    await page.keyboard.down('Alt')
    await expect.poll(() => stage.evaluate((el) => el.style.cursor)).toBe('move')
    await page.keyboard.up('Alt')
  })

  test('Alt+drag crops all 4 edges and all 4 corners while anchoring the opposite edges', async ({
    page,
  }) => {
    await openRunningStudio(page)
    const { at } = await stageHelper(page)

    // 1. Left edge dragged right (+60 canvas px): crop_left grows, x moves +60, right edge stays 1440.
    await resetWebcam(page)
    await altDragCanvas(page, at, { x: 960, y: 675 }, { x: 1020, y: 675 })
    let s = await readWebcamState(page)
    expect(s.tr.crop_left).toBeGreaterThanOrEqual(55)
    expect(s.tr.crop_left).toBeLessThanOrEqual(65)
    expect(s.tr.x).toBeGreaterThan(960)
    expect(s.tr.x + s.tr.bounds_width).toBeCloseTo(1440, 0)
    expect(s.tr.y).toBeCloseTo(540, 0)

    // 2. Top edge dragged down (+45 canvas px): crop_top grows, y moves +45, bottom edge stays 810.
    await resetWebcam(page)
    await altDragCanvas(page, at, { x: 1200, y: 540 }, { x: 1200, y: 585 })
    s = await readWebcamState(page)
    expect(s.tr.crop_top).toBeGreaterThanOrEqual(40)
    expect(s.tr.crop_top).toBeLessThanOrEqual(50)
    expect(s.tr.y).toBeGreaterThan(540)
    expect(s.tr.y + s.tr.bounds_height).toBeCloseTo(810, 0)
    expect(s.tr.x).toBeCloseTo(960, 0)

    // 3. Right edge dragged left (-60 canvas px): crop_right grows, x stays 960, width shrinks ~60.
    await resetWebcam(page)
    await altDragCanvas(page, at, { x: 1440, y: 675 }, { x: 1380, y: 675 })
    s = await readWebcamState(page)
    expect(s.tr.crop_right).toBeGreaterThanOrEqual(55)
    expect(s.tr.crop_right).toBeLessThanOrEqual(65)
    expect(s.tr.x).toBeCloseTo(960, 0)
    expect(s.tr.x + s.tr.bounds_width).toBeLessThan(1440)

    // 4. Bottom edge dragged up (-45 canvas px): crop_bottom grows, y stays 540, height shrinks ~45.
    await resetWebcam(page)
    await altDragCanvas(page, at, { x: 1200, y: 810 }, { x: 1200, y: 765 })
    s = await readWebcamState(page)
    expect(s.tr.crop_bottom).toBeGreaterThanOrEqual(40)
    expect(s.tr.crop_bottom).toBeLessThanOrEqual(50)
    expect(s.tr.y).toBeCloseTo(540, 0)
    expect(s.tr.y + s.tr.bounds_height).toBeLessThan(810)

    // 5. Top-left corner inward (+40, +30): crops left+top, bottom-right stays (1440, 810).
    await resetWebcam(page)
    await altDragCanvas(page, at, { x: 960, y: 540 }, { x: 1000, y: 570 })
    s = await readWebcamState(page)
    expect(s.tr.crop_left).toBeGreaterThan(30)
    expect(s.tr.crop_top).toBeGreaterThan(20)
    expect(s.tr.x + s.tr.bounds_width).toBeCloseTo(1440, 0)
    expect(s.tr.y + s.tr.bounds_height).toBeCloseTo(810, 0)

    // 6. Top-right corner inward (-40, +30): crops right+top, bottom-left stays (960, 810).
    await resetWebcam(page)
    await altDragCanvas(page, at, { x: 1440, y: 540 }, { x: 1400, y: 570 })
    s = await readWebcamState(page)
    expect(s.tr.crop_right).toBeGreaterThan(30)
    expect(s.tr.crop_top).toBeGreaterThan(20)
    expect(s.tr.x).toBeCloseTo(960, 0)
    expect(s.tr.y + s.tr.bounds_height).toBeCloseTo(810, 0)

    // 7. Bottom-right corner inward (-40, -30): crops right+bottom, top-left stays (960, 540).
    await resetWebcam(page)
    await altDragCanvas(page, at, { x: 1440, y: 810 }, { x: 1400, y: 780 })
    s = await readWebcamState(page)
    expect(s.tr.crop_right).toBeGreaterThan(30)
    expect(s.tr.crop_bottom).toBeGreaterThan(20)
    expect(s.tr.x).toBeCloseTo(960, 0)
    expect(s.tr.y).toBeCloseTo(540, 0)

    // 8. Bottom-left corner inward (+40, -30): crops left+bottom, top-right stays (1440, 540).
    await resetWebcam(page)
    await altDragCanvas(page, at, { x: 960, y: 810 }, { x: 1000, y: 780 })
    s = await readWebcamState(page)
    expect(s.tr.crop_left).toBeGreaterThan(30)
    expect(s.tr.crop_bottom).toBeGreaterThan(20)
    expect(s.tr.x + s.tr.bounds_width).toBeCloseTo(1440, 0)
    expect(s.tr.y).toBeCloseTo(540, 0)

    // No horizontal overflow at 1440px or 375px.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.waitForTimeout(200)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  })

  test('routes crop drags through PUT .../crop (save:false then save:true), supports grouped items, and coalesces undo', async ({
    page,
  }) => {
    await openRunningStudio(page)
    await resetWebcam(page)
    const { at } = await stageHelper(page)

    const beforeUndo = await demo<number>(
      page,
      `(d) => d.studioEngine.route('GET', ['studio', 'engine', 'history'], undefined).undo.length`,
    )

    await demo(
      page,
      `(d) => {
        const se = d.studioEngine
        const orig = se.route.bind(se)
        window.__cropCalls = []
        se.route = (method, rest, body, url) => {
          if (method === 'PUT' && rest.includes('crop')) {
            window.__cropCalls.push({ kind: 'crop', save: Boolean(body?.save) })
          } else if (method === 'PUT' && rest.includes('transform')) {
            window.__cropCalls.push({ kind: 'transform' })
          }
          return orig(method, rest, body, url)
        }
      }`,
    )

    await altDragCanvas(page, at, { x: 960, y: 675 }, { x: 1020, y: 675 })
    const calls = await page.evaluate(
      () =>
        (window as unknown as { __cropCalls: { kind: string; save?: boolean }[] }).__cropCalls ??
        [],
    )
    const cropSaves = calls.filter((c) => c.kind === 'crop').map((c) => Boolean(c.save))
    const transformPuts = calls.filter((c) => c.kind === 'transform').length
    expect(cropSaves.length).toBeGreaterThanOrEqual(2)
    expect(cropSaves.slice(0, -1).every((s) => !s)).toBe(true)
    expect(cropSaves.at(-1)).toBe(true)
    expect(transformPuts).toBe(0)

    // One drag creates exactly one undo entry and Undo restores pre-drag state.
    const afterUndo = await demo<number>(
      page,
      `(d) => d.studioEngine.route('GET', ['studio', 'engine', 'history'], undefined).undo.length`,
    )
    expect(afterUndo).toBe(beforeUndo + 1)

    await demo(page, `(d) => d.studioEngine.route('POST', ['studio', 'engine', 'undo'], {})`)
    const afterUndoState = await readWebcamState(page)
    expect(afterUndoState.tr.crop_left).toBe(0)
    expect(afterUndoState.tr.x).toBeCloseTo(960, 0)
    expect(afterUndoState.tr.bounds_width).toBeCloseTo(480, 0)

    // Grouped item: Alt+drag crops child inside its group and keeps opposite corner anchored.
    const groupedId = await demo<number>(
      page,
      `(d) => {
        const se = d.studioEngine
        const cam = se.route('GET', ['studio', 'engine', 'scenes', 'Main', 'items'], undefined).find((i) => i.name === 'Webcam')
        const grp = se.route('POST', ['studio', 'engine', 'scenes', 'Main', 'items'], { group: 'Crop Group', items: [cam.id] })
        return grp.id
      }`,
    )
    const scenes = page.getByRole('region', { name: 'Scenes' })
    await scenes.getByRole('button', { name: /^Starting Soon\b/ }).click()
    await scenes.getByRole('button', { name: /^Main\b/ }).click()
    await page.getByRole('button', { name: 'Webcam', exact: true }).click()

    await altDragCanvas(page, at, { x: 960, y: 675 }, { x: 1020, y: 675 })
    const groupedAfter = await readWebcamState(page)
    const groupBox = await demo<number[]>(
      page,
      `(d) => d.studioEngine.route('GET', ['studio', 'engine', 'scenes', 'Main', 'items'], undefined).find((i) => i.id === ${groupedId}).frame`,
    )
    expect(groupedAfter.tr.crop_left).toBeGreaterThanOrEqual(50)
    expect(groupedAfter.tr.x).toBeGreaterThan(960)
    expect(groupedAfter.tr.x + groupedAfter.tr.bounds_width).toBeCloseTo(1440, 0)
    expect(groupBox[4]).toBeGreaterThan(960)
    expect((groupBox[4] ?? 0) + (groupBox[0] ?? 0)).toBeCloseTo(1440, 0)
  })
})

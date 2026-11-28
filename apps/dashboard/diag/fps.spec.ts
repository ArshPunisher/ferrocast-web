/* eslint-disable no-console */
import { test } from '@playwright/test'

for (const dpr of [1, 2]) {
  for (const mode of ['zoom', 'transform']) {
    test.describe(`dpr${dpr} ${mode}`, () => {
      test.use({ deviceScaleFactor: dpr })
      test('themes page frames', async ({ page }) => {
        await page.addInitScript((m) => {
          const w = window as unknown as { __f: number }
          w.__f = 0
          const tick = () => {
            w.__f++
            requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
          if (m === 'transform') {
            Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' })
          }
        }, mode)
        await page.goto('./?autoplay=0&latency=0#/designs/themes')
        const series: number[] = []
        let last = 0
        let run = 0
        for (let i = 0; i < 40; i++) {
          await page.waitForTimeout(1000)
          const f = await page.evaluate(() => (window as unknown as { __f: number }).__f)
          series.push(f - last)
          last = f
          run = i >= 3 && series[i]! >= 15 ? run + 1 : 0
          if (run === 3) break
        }
        const zoomed = await page.evaluate(() => {
          const c = document
            .querySelector('[data-overlay-preview]')
            ?.firstElementChild?.shadowRoot?.querySelector<HTMLElement>('.fc-ov-canvas')
          return c ? `zoom=${c.style.zoom} transform=${c.style.transform}` : 'no canvas'
        })
        console.log(`DIAG dpr${dpr} ${mode} ${zoomed} series=${series.join(' ')}`)
      })
    })
  }
}

test('inventory of heavy styles in the previews', async ({ page }) => {
  await page.goto('./?autoplay=0&latency=0#/designs/themes')
  await page.waitForFunction(
    () => document.querySelectorAll('[data-overlay-preview]').length >= 8,
    null,
    {
      timeout: 120_000,
    },
  )
  const inv = await page.evaluate(() => {
    const grad: Record<string, { n: number; area: number; sample: string }> = {}
    const other: Record<string, number> = {}
    document.querySelectorAll('[data-overlay-preview]').forEach((p) => {
      const sr = p.firstElementChild?.shadowRoot
      if (!sr) return
      for (const e of Array.from(sr.querySelectorAll('*'))) {
        const cs = getComputedStyle(e)
        const r = e.getBoundingClientRect()
        const key = (
          e.className && typeof e.className === 'string' ? e.className : e.tagName
        ).slice(0, 50)
        if (/gradient/.test(cs.backgroundImage)) {
          const g = (grad[key] ??= { n: 0, area: 0, sample: cs.backgroundImage.slice(0, 90) })
          g.n++
          g.area += Math.round(r.width * r.height)
        }
        for (const [k, v] of [
          ['filter', cs.filter],
          ['willChange', cs.willChange],
          ['animName', cs.animationName],
          ['boxShadow', cs.boxShadow],
          ['mixBlend', cs.mixBlendMode],
          ['mask', cs.maskImage],
          ['backdrop', cs.backdropFilter],
        ] as const) {
          if (v && v !== 'none' && v !== 'auto' && v !== 'normal') other[k] = (other[k] ?? 0) + 1
        }
      }
    })
    return { grad, other }
  })
  console.log('DIAG inventory ' + JSON.stringify(inv))
})

test('platform facts', async ({ page }) => {
  await page.goto('./?autoplay=0&latency=0#/home')
  const facts = await page.evaluate(() => {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl') as WebGLRenderingContext | null
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return {
      ua: navigator.userAgent,
      platform: navigator.platform,
      zoom: CSS.supports('zoom', '1'),
      webgl: gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : null,
      dpr: window.devicePixelRatio,
    }
  })
  console.log('DIAG facts ' + JSON.stringify(facts))
})

test('home page frames (control)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __f: number }
    w.__f = 0
    const tick = () => {
      w.__f++
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.goto('./?autoplay=0&latency=0#/home')
  const series: number[] = []
  let last = 0
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(1000)
    const f = await page.evaluate(() => (window as unknown as { __f: number }).__f)
    series.push(f - last)
    last = f
  }
  console.log(`DIAG home series=${series.join(' ')}`)
})

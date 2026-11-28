/* eslint-disable no-console */
import { test } from '@playwright/test'

test.skip('inventory of heavy styles in the previews', async ({ page }) => {
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

const CORE = [
  'home',
  'studio/golive',
  'studio/vertical',
  'chat',
  'alerts',
  'alerts/sub',
  'overlays',
  'overlays/ov-main',
]

test('ov-main overflow after the core sweep', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fc-nav-folded', '0'))
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('./?autoplay=0&latency=0&studioEngine=1#/home')
  await page.waitForSelector('#main')
  const vps = [
    { width: 1280, height: 800 },
    { width: 1024, height: 600 },
    { width: 900, height: 700 },
    { width: 375, height: 812 },
  ]
  for (const route of CORE) {
    await page.evaluate((r) => (location.hash = `#/${r}`), route)
    await page.waitForTimeout(800)
    for (const vp of vps) {
      await page.setViewportSize(vp)
      await page.waitForTimeout(50)
      if (route !== 'overlays/ov-main' && route !== 'overlays' && vp.width !== 1024) continue
      for (let i = 0; i < (route === 'overlays/ov-main' && vp.width === 1024 ? 4 : 1); i++) {
        const m = await page.evaluate(() => {
          const de = document.documentElement
          const offenders = Array.from(document.body.querySelectorAll('*'))
            .map((e) => ({ e, r: e.getBoundingClientRect() }))
            .filter((x) => x.r.bottom > window.innerHeight + 2 && x.r.height > 0)
            .sort((a, b) => b.r.bottom - a.r.bottom)
            .slice(0, 6)
            .map(
              (x) =>
                `${x.e.tagName}.${String((x.e as HTMLElement).className).slice(0, 70)}@${Math.round(x.r.top)}-${Math.round(x.r.bottom)}`,
            )
          return { sh: de.scrollHeight, ih: window.innerHeight, offenders }
        })
        console.log(`DIAG sweep ${route} ${vp.width}x${vp.height} i=${i} ${JSON.stringify(m)}`)
        await page.waitForTimeout(700)
      }
    }
  }
})

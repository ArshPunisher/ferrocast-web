import { test } from '@playwright/test'

const SHADOW: Record<string, string> = {
  control: '',
  hide: '.fc-ov{display:none!important}',
  allOff:
    '.fc-w,.fc-w *,.fc-w *::before,.fc-w *::after{animation:none!important;transition:none!important;filter:none!important;box-shadow:none!important;text-shadow:none!important;background-image:none!important;mix-blend-mode:normal!important;mask:none!important;-webkit-mask:none!important;clip-path:none!important}',
  allBut_anim:
    '.fc-w,.fc-w *,.fc-w *::before,.fc-w *::after{filter:none!important;box-shadow:none!important;text-shadow:none!important;background-image:none!important;mix-blend-mode:normal!important;mask:none!important;-webkit-mask:none!important;clip-path:none!important}',
  allBut_filter:
    '.fc-w,.fc-w *,.fc-w *::before,.fc-w *::after{animation:none!important;transition:none!important;box-shadow:none!important;text-shadow:none!important;background-image:none!important;mix-blend-mode:normal!important;mask:none!important;-webkit-mask:none!important;clip-path:none!important}',
  allBut_boxshadow:
    '.fc-w,.fc-w *,.fc-w *::before,.fc-w *::after{animation:none!important;transition:none!important;filter:none!important;text-shadow:none!important;background-image:none!important;mix-blend-mode:normal!important;mask:none!important;-webkit-mask:none!important;clip-path:none!important}',
  allBut_textshadow:
    '.fc-w,.fc-w *,.fc-w *::before,.fc-w *::after{animation:none!important;transition:none!important;filter:none!important;box-shadow:none!important;background-image:none!important;mix-blend-mode:normal!important;mask:none!important;-webkit-mask:none!important;clip-path:none!important}',
  allBut_bgimage:
    '.fc-w,.fc-w *,.fc-w *::before,.fc-w *::after{animation:none!important;transition:none!important;filter:none!important;box-shadow:none!important;text-shadow:none!important;mix-blend-mode:normal!important;mask:none!important;-webkit-mask:none!important;clip-path:none!important}',
  allBut_blend:
    '.fc-w,.fc-w *,.fc-w *::before,.fc-w *::after{animation:none!important;transition:none!important;filter:none!important;box-shadow:none!important;text-shadow:none!important;background-image:none!important;mask:none!important;-webkit-mask:none!important;clip-path:none!important}',
  allBut_mask:
    '.fc-w,.fc-w *,.fc-w *::before,.fc-w *::after{animation:none!important;transition:none!important;filter:none!important;box-shadow:none!important;text-shadow:none!important;background-image:none!important;mix-blend-mode:normal!important;clip-path:none!important}',
  allBut_clip:
    '.fc-w,.fc-w *,.fc-w *::before,.fc-w *::after{animation:none!important;transition:none!important;filter:none!important;box-shadow:none!important;text-shadow:none!important;background-image:none!important;mix-blend-mode:normal!important;mask:none!important;-webkit-mask:none!important}',
  only_boxshadow: '.fc-w,.fc-w *,.fc-w *::before,.fc-w *::after{box-shadow:none!important}',
  only_bgimage: '.fc-w,.fc-w *,.fc-w *::before,.fc-w *::after{background-image:none!important}',
  only_filter: '.fc-w,.fc-w *,.fc-w *::before,.fc-w *::after{filter:none!important}',
  only_anim:
    '.fc-w,.fc-w *,.fc-w *::before,.fc-w *::after{animation:none!important;transition:none!important}',
}

for (const [name, css] of Object.entries(SHADOW)) {
  test(`themes page frames: ${name}`, async ({ page }) => {
    await page.addInitScript((sheet) => {
      const w = window as unknown as { __f: number }
      w.__f = 0
      const tick = () => {
        w.__f++
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      const orig = Element.prototype.attachShadow
      Element.prototype.attachShadow = function (o: ShadowRootInit) {
        const sr = orig.call(this, o)
        if (sheet) {
          const sh = new CSSStyleSheet()
          sh.replaceSync(sheet)
          sr.adoptedStyleSheets = [sh]
        }
        return sr
      }
    }, css)
    const t0 = Date.now()
    await page.goto('./?autoplay=0&latency=0#/designs/themes')
    const series: number[] = []
    let last = 0
    let firstFast = -1
    let run = 0
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(1000)
      const f = await page.evaluate(() => (window as unknown as { __f: number }).__f)
      series.push(f - last)
      last = f
      run = i >= 3 && series[i]! >= 15 ? run + 1 : 0
      if (run === 3) {
        firstFast = i - 1
        break
      }
    }
    const previews = await page.evaluate(
      () => document.querySelectorAll('[data-overlay-preview]').length,
    )
    console.log(
      `DIAG ${name.padEnd(18)} firstFastSec=${firstFast} previews=${previews} series=${series.join(' ')} total=${Date.now() - t0}ms`,
    )
  })
}

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

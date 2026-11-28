import { test } from '@playwright/test'

const SHADOW: Record<string, string> = {
  control: '',
  hide: '.fc-ov{display:none!important}',
  filterOff: '.fc-w,.fc-w *{filter:none!important}',
  animOff:
    '.fc-w,.fc-w *,.fc-w *::before,.fc-w *::after{animation:none!important;transition:none!important}',
  gradOff: '.fc-w *{background-image:none!important}',
  blendMaskOff:
    '.fc-w,.fc-w *{mix-blend-mode:normal!important;mask:none!important;-webkit-mask:none!important;clip-path:none!important}',
  containStrict: '.fc-w{contain:strict!important}',
  zoomNotTransform: '.fc-ov-canvas{transform:none!important;zoom:.2677!important}',
  fontsOff: '.fc-w,.fc-w *{font-family:sans-serif!important}',
  textOff: '.fc-w,.fc-w *{color:transparent!important;text-shadow:none!important}',
  allOff:
    '.fc-w,.fc-w *,.fc-w *::before,.fc-w *::after{animation:none!important;transition:none!important;filter:none!important;box-shadow:none!important;text-shadow:none!important;background-image:none!important;mix-blend-mode:normal!important;mask:none!important;clip-path:none!important}',
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
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(1000)
      const f = await page.evaluate(() => (window as unknown as { __f: number }).__f)
      series.push(f - last)
      if (firstFast < 0 && f - last >= 15) firstFast = i + 1
      last = f
      if (firstFast >= 0 && i >= firstFast + 2) break
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

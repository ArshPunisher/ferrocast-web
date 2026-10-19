import { expect, type Page } from '@playwright/test'

export type Fault = {
  path: string
  status: number
  method?: string
  code?: string
  message?: string
  hint?: string
  times?: number
}

/** Opens a screen in demo mode. `autoplay=0` keeps the stream still so tests are stable. */
export async function open(
  page: Page,
  route = 'home',
  query = 'autoplay=0&latency=0',
): Promise<void> {
  await page.goto(`./?${query}#/${route}`)
  await expect(page.locator('#main')).toBeVisible()
}

/** Waits until no CSS or Web Animation in the page is still running (a dialog's scale-in,
 *  a sheet sliding up), so sizes and colours are measured at rest. Infinite, paused and
 *  stopped animations are ignored: they never finish. */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document
      .getAnimations()
      .filter(
        (a) =>
          a.playState === 'running' &&
          a.playbackRate !== 0 &&
          a.effect?.getComputedTiming().endTime !== Infinity,
      )
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)))
  })
}

export async function fault(page: Page, f: Fault): Promise<void> {
  await page.evaluate((x) => {
    const d = window.__ferrocastDemo
    if (!d) throw new Error('not in demo mode')
    d.addFault({ ...x, path: x.path })
  }, f)
}

export async function demo<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate((src) => {
    const d = window.__ferrocastDemo as unknown as Record<string, (...a: unknown[]) => unknown>
    return new Function('d', `return (${src})(d)`)(d) as T
  }, fn)
}

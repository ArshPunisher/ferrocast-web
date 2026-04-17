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

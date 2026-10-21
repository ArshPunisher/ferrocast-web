// Designs: the gallery, both designer views, branding rules, Use, export and import, the
// asset-pack importer and the layout editor's new layers. Runs the built dashboard in demo
// mode with the real built-in catalogue.

import { expect, test, type Page } from '@playwright/test'
import { open } from './helpers'

/** Elements inside any open shadow root (the overlay renderer draws alerts there). */
async function deepCount(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const walk = (root: Document | ShadowRoot): number => {
      let n = root.querySelectorAll(sel).length
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) n += walk(el.shadowRoot)
      return n
    }
    return walk(document)
  }, selector)
}

async function deepText(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const out: string[] = []
    const walk = (root: Document | ShadowRoot) => {
      for (const el of root.querySelectorAll(sel)) out.push(el.textContent ?? '')
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot)
    }
    walk(document)
    return out.join('\n')
  }, selector)
}

/** A card in the tab's grid (Themes also has a Featured row with the same names). */
const tile = (page: Page, name: string) =>
  page.locator('[aria-live="polite"]').getByRole('article', { name, exact: true })

test.describe('smoke', () => {
  test(
    'the app boots, the gallery loads, a built-in alert renders',
    { tag: '@smoke' },
    async ({ page }) => {
      await open(page, 'designs/alerts')
      await expect(page.getByRole('heading', { name: 'Designs', level: 1 })).toBeVisible()
      await expect(page.getByRole('link', { name: /Alerts 47/ })).toHaveAttribute(
        'aria-current',
        'page',
      )
      await expect(tile(page, 'Molten plate')).toBeVisible()
      await expect.poll(() => deepCount(page, '.fa.f-plate')).toBeGreaterThan(0)
    },
  )

  test(
    'a test alert from the designer reaches the overlays',
    { tag: '@smoke' },
    async ({ page }) => {
      await open(page, 'designer/builtin.molten-plate')
      await page.getByRole('button', { name: 'Send test alert' }).first().click()
      await expect(page.getByText(/Test alert sent/)).toBeVisible()
    },
  )
})

test.describe('gallery', () => {
  test('tabs, style chips, the motion menu, search and clearing', async ({ page }) => {
    await open(page, 'designs')
    const grid = page.locator('[aria-live="polite"] > article')
    // Themes first: a featured row of full bundles, then every theme.
    await expect(page.getByRole('heading', { name: 'Featured' })).toBeVisible()
    await expect(grid).toHaveCount(28)
    await expect(tile(page, 'Floodlight')).toContainText('5 scenes + alerts')
    await page.getByRole('link', { name: /^Widgets \d+/ }).click()
    await expect(page).toHaveURL(/#\/designs\/widgets$/)
    // Widget designs, plus the small scene designs (rotators, countdowns, now playing).
    await expect(grid).toHaveCount(50)
    await expect(tile(page, 'Ring countdown')).toBeVisible()
    await page.getByRole('link', { name: /^Alerts \d+/ }).click()
    await expect(grid).toHaveCount(47)
    const styles = page.getByRole('group', { name: 'Style' })
    await styles.getByRole('button', { name: 'Retro' }).click()
    await expect(tile(page, 'Pixel arcade')).toBeVisible()
    await expect(tile(page, 'Molten plate')).toHaveCount(0)
    await page.getByRole('button', { name: /Any motion/ }).click()
    await page.getByRole('menuitem', { name: 'Lively' }).click()
    await expect(page.getByRole('button', { name: /Lively/ })).toBeVisible()
    const lively = await grid.count()
    expect(lively).toBeGreaterThan(0)
    // Every built-in design is free: no Pro marks and no free-only filter.
    await expect(page.getByRole('button', { name: 'Free only' })).toHaveCount(0)
    await expect(grid.getByText('Pro', { exact: true })).toHaveCount(0)
    await styles.getByRole('button', { name: 'Minimal' }).click()
    await page.getByRole('button', { name: /Lively/ }).click()
    await page.getByRole('menuitem', { name: 'Calm' }).click()
    await page.getByRole('searchbox', { name: 'Search alerts' }).fill('zzz-nothing')
    await expect(page.getByText('Nothing matches these filters')).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(grid).toHaveCount(47)
    await page.getByRole('searchbox', { name: 'Search alerts' }).fill('sixer')
    await expect(grid).toHaveCount(1)
    await page.getByRole('link', { name: /My designs/ }).click()
    await expect(page).toHaveURL(/#\/designs\/mine$/)
    await expect(page.getByText('No designs of your own yet')).toBeVisible()
  })

  test('a theme opens with every scene and its alert, and Use theme sets it up', async ({
    page,
  }) => {
    await open(page, 'designs')
    await tile(page, 'Chai & rain').getByRole('button', { name: 'Preview' }).click()
    const sheet = page.getByRole('dialog', { name: 'Chai & rain' })
    const scenes = sheet.getByRole('tablist', { name: 'Chai & rain scenes' })
    const names = ['Starting soon', 'In game', 'Just chatting', 'Be right back', 'Ending', 'Alerts']
    for (const [i, name] of names.entries())
      await expect(scenes.getByRole('tab').nth(i)).toHaveAccessibleName(name)
    await scenes.getByRole('tab', { name: 'Alerts' }).click()
    await expect(scenes.getByRole('tab', { name: 'Alerts' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect.poll(() => deepCount(page, '.fa')).toBeGreaterThan(0)
    // The rain and the looping alert keep CI's Linux WebKit from ever reporting the footer as
    // "stable" (it doesn't move: the stage has a fixed aspect ratio), so the click skips that
    // wait. The next line still proves the button works.
    await sheet.getByRole('button', { name: 'Use theme' }).click({ force: true })
    await expect(page.getByRole('dialog', { name: 'Use Chai & rain' })).toBeVisible()
  })

  test('"Preview as" switches the event every alert tile plays', async ({ page }) => {
    await open(page, 'designs/alerts')
    await page
      .getByRole('group', { name: 'Preview as' })
      .getByRole('button', { name: 'Raid' })
      .click()
    await expect.poll(() => deepText(page, '.fa-title')).toMatch(/raid|viewers/i)
  })

  test('Use an alert design: it plays your alerts and says it keeps the mark', async ({ page }) => {
    await open(page, 'designs/alerts')
    await tile(page, 'Neon sign').getByRole('button', { name: 'Use' }).click()
    await expect(page.getByText(/Neon sign now plays your alerts\. It is a built-in/)).toBeVisible()
    await expect(tile(page, 'Neon sign').getByText('Plays your alerts now')).toBeVisible()
  })

  test('Duplicate & customise makes an unbranded copy that opens in the designer', async ({
    page,
  }) => {
    await open(page, 'designs/alerts')
    await expect.poll(() => deepCount(page, '.fa-spark')).toBeGreaterThan(0)
    await tile(page, 'Glass card').getByRole('button', { name: 'Duplicate & customise' }).click()
    await expect(page).toHaveURL(/#\/designer\/d/)
    await expect(page.getByText('Mine', { exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Design name' })).toHaveValue('Glass card copy')
    await expect.poll(() => deepCount(page, '.fa')).toBeGreaterThan(0)
    expect(await deepCount(page, '.fa-spark, .al-spikes'), 'the copy has no Ferrocast mark').toBe(0)
  })

  test('using a theme makes one overlay per scene', async ({ page }) => {
    await open(page, 'designs')
    await tile(page, 'Forge').getByRole('button', { name: 'Use theme' }).click()
    const dialog = page.getByRole('dialog', { name: 'Use Forge' })
    await expect(dialog.getByRole('switch', { name: 'Also use its alert style' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Make 5 overlays' }).click()
    await expect(page.getByText(/Made 5 overlays from Forge/)).toBeVisible()
    await expect(page).toHaveURL(/#\/overlays$/)
    await expect(page.getByText('Starting soon (Forge)')).toBeVisible()
  })

  test('a widget design is added to the overlay picked', async ({ page }) => {
    await open(page, 'designs/widgets')
    await tile(page, 'Segment goal').getByRole('button', { name: 'Use' }).click()
    const dialog = page.getByRole('dialog', { name: 'Use Segment goal' })
    await expect(dialog.getByRole('button', { name: 'Add widget' })).toBeDisabled()
    await dialog.getByLabel('Add it to').selectOption({ index: 1 })
    await dialog.getByRole('button', { name: 'Add widget' }).click()
    await expect(page.getByText(/Segment goal added to/)).toBeVisible()
    await expect(page.getByRole('button', { name: /^Goal widget at/ }).last()).toBeVisible()
  })
})

test.describe('designer', () => {
  test('both views edit the same design; the choice is remembered', async ({ page }) => {
    await open(page, 'designs/alerts')
    await tile(page, 'Molten plate').getByRole('button', { name: 'Duplicate & customise' }).click()
    await expect(page.getByRole('tablist', { name: 'Inspector sections' })).toBeVisible()
    // Stage view: change the headline in the Text tab, see it on the stage.
    await page.getByRole('tab', { name: 'Text' }).click()
    await page.getByRole('textbox', { name: 'Headline' }).fill('{name} is a legend')
    await expect.poll(() => deepText(page, '.fa-title')).toMatch(/is a legend/)
    // Guided view shows the same draft.
    await page.getByRole('radio', { name: 'Guided' }).check({ force: true })
    await expect(page.getByRole('heading', { name: 'Make your tip alert' })).toBeVisible()
    await page.getByRole('button', { name: /Text/ }).filter({ hasText: 'What it says' }).click()
    await expect(page.getByRole('textbox', { name: 'Headline' })).toHaveValue('{name} is a legend')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Design saved.')).toBeVisible()
    // The view is remembered: leave and come back through My designs.
    await page.getByRole('link', { name: 'Back to designs' }).click()
    await tile(page, 'Molten plate copy').getByRole('link', { name: 'Edit' }).click()
    await expect(page.getByRole('heading', { name: 'Make your tip alert' })).toBeVisible()
    await expect.poll(() => deepText(page, '.fa-title')).toMatch(/is a legend/)
    expect(await page.evaluate(() => localStorage.getItem('fc.designer.view'))).toBe('guided')
  })

  test('undo and redo with the keyboard and the buttons', async ({ page }) => {
    await open(page, 'designer/builtin.esports-banner')
    await page.getByRole('radio', { name: 'Stage' }).check({ force: true })
    await page.getByRole('button', { name: 'Neon sign' }).click()
    await expect.poll(() => deepCount(page, '.fa.f-neon')).toBe(1)
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(() => deepCount(page, '.fa.f-banner')).toBe(1)
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect.poll(() => deepCount(page, '.fa.f-neon')).toBe(1)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect.poll(() => deepCount(page, '.fa.f-banner')).toBe(1)
    // A built-in with edits saves as your own copy.
    await page.getByRole('button', { name: 'Redo' }).click()
    await page.getByRole('button', { name: 'Save my copy' }).click()
    await expect(page.getByText(/your own copy without Ferrocast branding/)).toBeVisible()
    await expect(page).toHaveURL(/#\/designer\/d/)
  })

  test('the timeline edges are sliders that change the timing', async ({ page }) => {
    await open(page, 'designer/builtin.molten-plate')
    await page.getByRole('radio', { name: 'Stage' }).check({ force: true })
    const length = page.getByRole('slider', { name: 'Alert length' })
    await expect(length).toHaveAttribute('aria-valuenow', '6500')
    await length.focus()
    await page.keyboard.press('ArrowRight')
    await expect(length).toHaveAttribute('aria-valuenow', '7000')
    await expect(page.getByText('7.0 s total')).toBeVisible()
    const delay = page.getByRole('slider', { name: 'Text delay' })
    await delay.focus()
    await page.keyboard.press('Shift+ArrowRight')
    await expect(delay).toHaveAttribute('aria-valuenow', '700')
  })

  test('variations: add one with a condition', async ({ page }) => {
    await open(page, 'designer/builtin.pixel-arcade')
    await page.getByRole('radio', { name: 'Stage' }).check({ force: true })
    await page.getByRole('tab', { name: 'When' }).click()
    await page.getByRole('button', { name: 'Add a variation' }).last().click()
    await expect(
      page.getByRole('group', { name: 'Variations' }).getByRole('button', { name: 'Variation 1' }),
    ).toBeVisible()
    await page.getByLabel('Amount', { exact: true }).fill('2500')
    await expect(page.getByText('Amount ≥ 2,500')).toBeVisible()
  })

  test('leaving with unsaved changes asks first', async ({ page }) => {
    await open(page, 'designer/builtin.comic-burst')
    await page.getByRole('radio', { name: 'Stage' }).check({ force: true })
    await page.getByRole('button', { name: 'Glass card' }).click()
    await page.getByRole('link', { name: 'Back to designs' }).click()
    const ask = page.getByRole('dialog', { name: 'Save your design first?' })
    await expect(ask).toBeVisible()
    await ask.getByRole('button', { name: 'Discard' }).click()
    await expect(page).toHaveURL(/#\/designs\/alerts$/)
  })
})

test.describe('theme designer', () => {
  test('an edited built-in theme saves as an unbranded copy; its mark can’t be moved', async ({
    page,
  }) => {
    await open(page, 'designer/builtin.forge')
    const mark = page.getByRole('button', { name: /^Ferrocast mark layer at/ })
    await mark.focus()
    const before = await mark.getAttribute('aria-label')
    await page.keyboard.press('ArrowRight')
    await expect(mark).toHaveAttribute('aria-label', before ?? '')
    const label = page.getByRole('button', { name: /^Label widget at/ })
    await label.focus()
    await page.keyboard.press('ArrowRight')
    await page.getByRole('button', { name: 'Save my copy' }).click()
    await expect(
      page.getByText(/Saved as Forge, your own copy without Ferrocast branding/),
    ).toBeVisible()
    await expect(page).toHaveURL(/#\/designer\/d/)
    await expect(page.getByRole('button', { name: /^Ferrocast mark layer at/ })).toHaveCount(0)
  })
})

test.describe('design files', () => {
  test('export then import makes a new design of your own', async ({ page }) => {
    await open(page, 'designs/alerts')
    await tile(page, 'Molten plate').getByRole('button', { name: 'Duplicate & customise' }).click()
    await expect(page).toHaveURL(/#\/designer\/d/)
    await page.goto('./?autoplay=0&latency=0#/designs/mine')
    await expect(tile(page, 'Molten plate copy')).toBeVisible()
    const download = page.waitForEvent('download')
    await tile(page, 'Molten plate copy')
      .getByRole('button', { name: /More for/ })
      .click()
    await page.getByRole('menuitem', { name: 'Export or share' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('Molten-plate-copy.ferrodesign')
    const path = await file.path()
    await page.getByRole('button', { name: 'Import' }).click()
    await page.getByRole('menuitem', { name: /Design file/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Import a design file' })
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'Molten-plate-copy.ferrodesign',
      mimeType: 'application/zip',
      buffer: await (await import('node:fs/promises')).readFile(path),
    })
    await dialog.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(page.getByText(/Imported Molten plate copy to My designs/)).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(2)
  })

  test('a file that isn’t a design file gets a clear reason', async ({ page }) => {
    await open(page, 'designs')
    await page.getByRole('button', { name: 'Import' }).click()
    await page.getByRole('menuitem', { name: /Design file/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Import a design file' })
    await dialog
      .locator('input[type=file]')
      .setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') })
    await expect(dialog.getByRole('alert')).toHaveText(/isn’t a \.ferrodesign file/)
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'fake.ferrodesign',
      mimeType: 'application/zip',
      buffer: Buffer.from('not a zip'),
    })
    await dialog.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText(
      /isn't a \.ferrodesign\. Pick a \.ferrodesign file exported from Ferrocast/,
    )
  })
})

test.describe('asset pack importer', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  const MP3 = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0])

  test('matches files to alerts by name, lets you fix them, builds a design', async ({ page }) => {
    await open(page, 'designs')
    await page.getByRole('button', { name: 'Import' }).click()
    await page.getByRole('menuitem', { name: /Asset pack/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Import an asset pack' })
    await dialog.locator('input[type=file]').setInputFiles([
      { name: 'follow.png', mimeType: 'image/png', buffer: PNG },
      { name: 'follow.mp3', mimeType: 'audio/mpeg', buffer: MP3 },
      { name: 'donation.png', mimeType: 'image/png', buffer: PNG },
      { name: 'panel_about.png', mimeType: 'image/png', buffer: PNG },
      { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') },
    ])
    await expect(
      dialog.getByRole('combobox', { name: 'Use follow.png and follow.mp3 as' }),
    ).toHaveValue('follow')
    await expect(dialog.getByRole('combobox', { name: 'Use donation.png as' })).toHaveValue('tip')
    await expect(dialog.getByRole('combobox', { name: 'Use panel_about.png as' })).toHaveValue(
      'library',
    )
    await expect(dialog.getByText('1 left out')).toBeVisible()
    await dialog.getByRole('combobox', { name: 'Use panel_about.png as' }).selectOption('raid')
    await dialog.getByRole('button', { name: 'Build alerts' }).click()
    await expect(page.getByText(/Built .*: 3 alerts from 4 files/)).toBeVisible()
    await expect(page).toHaveURL(/#\/designer\/d/)
    await expect.poll(() => deepCount(page, '.fa-media img')).toBeGreaterThan(0)
  })
})

test.describe('layout editor layers', () => {
  test('add a text layer, hide and lock it, undo', async ({ page }) => {
    await open(page, 'overlays/ov-brb')
    await page
      .getByRole('toolbar', { name: 'Canvas' })
      .getByRole('button', { name: 'Text', exact: true })
      .click()
    const layer = page.getByRole('button', { name: /^Text: Your text here layer at/ })
    await expect(layer).toBeVisible()
    // Row actions show on hover or focus.
    const row = page
      .getByRole('list', { name: 'Layers, top first' })
      .getByRole('listitem')
      .filter({ hasText: 'Text: Your text here' })
    await row.hover()
    await page.getByRole('button', { name: 'Hide Text: Your text here' }).click()
    await row.hover()
    await expect(layer).toHaveAccessibleName(/Hidden on stream/)
    await page.getByRole('button', { name: 'Lock Text: Your text here' }).click()
    await expect(layer).toHaveAccessibleName(/Locked/)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(layer).not.toHaveAccessibleName(/Locked/)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Overlay saved. OBS updates by itself.')).toBeVisible()
  })

  test('align buttons move the selected layer to the canvas edges', async ({ page }) => {
    await open(page, 'overlays/ov-brb')
    const w = page.getByRole('button', { name: /Alerts widget at/ })
    await w.focus()
    await page.getByRole('button', { name: 'Align left' }).click()
    await expect(w).toHaveAccessibleName(/at 0, /)
    await page.getByRole('button', { name: 'Align bottom' }).click()
    await expect(w).toHaveAccessibleName(/at 0, \d+, 800 by \d+/)
  })

  test('an overlay from a built-in keeps its mark layer', async ({ page }) => {
    await open(page, 'designs')
    await tile(page, 'Arcade night').getByRole('button', { name: 'Use' }).click()
    await page
      .getByRole('dialog', { name: 'Use Arcade night' })
      .getByRole('button', { name: 'Make 5 overlays' })
      .click()
    await page.getByRole('link', { name: 'Edit In game (Arcade night)' }).click()
    await expect(page.getByText(/keeps a small Ferrocast mark/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hide Ferrocast mark' })).toHaveCount(0)
  })
})

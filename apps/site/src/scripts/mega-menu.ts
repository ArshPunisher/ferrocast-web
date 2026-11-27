// The header's menu. Panels open on hover (with a short delay so crossing the gap does not
// flicker), on click and tap, and when a trigger gets keyboard focus. Escape closes the
// panel and puts focus back on its trigger. Below 960px the same links live in a drawer.

const DESKTOP = '(min-width: 960px)'

export function initMegaMenu(root: HTMLElement) {
  const zone = root.querySelector<HTMLElement>('[data-mm-zone]') ?? root
  const triggers = [...root.querySelectorAll<HTMLButtonElement>('[data-mm-trigger]')]
  const views = new Map<string, HTMLElement>()
  root.querySelectorAll<HTMLElement>('[data-mm-view]').forEach((v) => {
    views.set(v.dataset.mmView ?? '', v)
  })
  const desktop = matchMedia(DESKTOP)
  let openKey: string | null = null
  let via: 'hover' | 'click' | 'focus' | 'key' | null = null
  let tIn = 0
  let tOut = 0
  let restoring = false

  const triggerOf = (key: string) => triggers.find((t) => t.dataset.mmTrigger === key) ?? null

  const setOpen = (key: string | null, how: typeof via) => {
    openKey = key
    via = how
    if (key) root.dataset.open = key
    else delete root.dataset.open
    for (const t of triggers) t.setAttribute('aria-expanded', String(t.dataset.mmTrigger === key))
    for (const [k, v] of views) {
      const on = k === key
      v.classList.toggle('is-open', on)
      v.inert = !on
    }
  }
  const close = () => {
    clearTimeout(tIn)
    clearTimeout(tOut)
    if (openKey) setOpen(null, null)
  }

  for (const t of triggers) {
    const key = t.dataset.mmTrigger ?? ''
    t.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return
      clearTimeout(tOut)
      clearTimeout(tIn)
      if (openKey && openKey !== key) setOpen(key, 'hover')
      else if (!openKey)
        tIn = window.setTimeout(() => {
          if (!openKey) setOpen(key, 'hover')
        }, 90)
    })
    t.addEventListener('pointerleave', () => clearTimeout(tIn))
    t.addEventListener('click', () => {
      clearTimeout(tIn)
      if (openKey === key) {
        // a click on a panel opened by hover or focus keeps it; a second click closes it
        if (via === 'click') close()
        else via = 'click'
      } else setOpen(key, 'click')
    })
    t.addEventListener('focusin', () => {
      if (restoring || !desktop.matches) return
      if (t.matches(':focus-visible')) setOpen(key, 'focus')
    })
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown') return
      e.preventDefault()
      if (openKey !== key) setOpen(key, 'key')
      views.get(key)?.querySelector<HTMLElement>('a[href]')?.focus()
    })
  }

  // choosing a link closes the panel (a link to a #section of this very page stays put)
  zone.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-mm-view] a[href]')) close()
  })
  zone.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse') clearTimeout(tOut)
  })
  zone.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return
    clearTimeout(tIn)
    tOut = window.setTimeout(close, 220)
  })
  // the logo and the buttons on the right are outside the menu: pointing at them closes it
  root.querySelectorAll<HTMLElement>('[data-mm-close-on-hover]').forEach((el) => {
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse' || !openKey) return
      clearTimeout(tOut)
      tOut = window.setTimeout(close, 140)
    })
    el.addEventListener('focusin', () => {
      if (openKey && !restoring) close()
    })
  })
  zone.addEventListener('focusout', (e) => {
    const next = e.relatedTarget as Node | null
    if (next && !zone.contains(next)) close()
  })
  document.addEventListener('pointerdown', (e) => {
    if (openKey && !zone.contains(e.target as Node)) close()
  })

  // ---- the drawer on phones and narrow windows
  const burger = root.querySelector<HTMLButtonElement>('[data-mm-burger]')
  const drawer = root.querySelector<HTMLElement>('[data-mm-drawer]')
  const setDrawer = (on: boolean, back: boolean) => {
    if (!drawer || !burger) return
    root.toggleAttribute('data-drawer-open', on)
    burger.setAttribute('aria-expanded', String(on))
    drawer.inert = !on
    document.documentElement.style.overflow = on ? 'hidden' : ''
    if (on)
      window.setTimeout(
        () =>
          drawer
            .querySelector<HTMLElement>('[data-mm-drawer-close]')
            ?.focus({ preventScroll: true }),
        60,
      )
    else if (back) burger.focus()
  }
  if (drawer && burger) {
    drawer.inert = true
    burger.addEventListener('click', () => setDrawer(!root.hasAttribute('data-drawer-open'), true))
    root
      .querySelectorAll<HTMLElement>('[data-mm-drawer-close], [data-mm-dscrim]')
      .forEach((b) => b.addEventListener('click', () => setDrawer(false, true)))
    drawer.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return
      const focusable = [
        ...drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      ].filter((n) => n.offsetParent !== null && getComputedStyle(n).visibility !== 'hidden')
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    })
    drawer.querySelectorAll<HTMLButtonElement>('[data-acc-btn]').forEach((b) =>
      b.addEventListener('click', () => {
        const acc = b.closest('[data-acc]')
        const on = !acc?.classList.contains('open')
        acc?.classList.toggle('open', on)
        b.setAttribute('aria-expanded', String(on))
      }),
    )
    // a drawer link that stays on this page (a #section) should not leave the drawer open
    drawer.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest('a[href]')
      if (a) setDrawer(false, false)
    })
    desktop.addEventListener('change', () => {
      if (desktop.matches) setDrawer(false, false)
    })
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (root.hasAttribute('data-drawer-open')) {
      setDrawer(false, true)
      return
    }
    if (!openKey) return
    const key = openKey
    close()
    const t = triggerOf(key)
    if (t) {
      restoring = true
      t.focus()
      window.setTimeout(() => (restoring = false), 60)
    }
  })
}

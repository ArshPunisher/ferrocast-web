// The home page's opening, played on every load of the page. Three beats, one after the
// other, each on its own part of the banner:
//
// 1. On air (0 to 0.8 s): the page sits dimmed like a studio before the show. An ON AIR
//    sign stands where the eyebrow will be; its tally lamp blinks twice, then the page
//    lights up with a soft Molten wash from the lamp and a tally line along the header.
// 2. Level check (0.5 to 1.4 s): each headline line is read in left to right behind a
//    Molten level cursor while a small meter under it peaks once and drains; the copy and
//    buttons follow, and the sign hands over to the real eyebrow text.
// 3. Spark drop (alongside, see hero-field.ts): the particles pull together into the Spark,
//    burst into the star field, and the three chats flow out of the hub to Twitch, YouTube
//    and Kick.
//
// The page's text is real from the first frame; this only animates it. Any scroll, touch,
// click or key finishes everything at once. CSS holds the start states only while
// html.intro-hold is set, and a CSS failsafe shows everything if this script never runs.

const EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)'

export function playIntro(hero: HTMLElement) {
  const root = document.documentElement
  const anims: Animation[] = []
  const extras: HTMLElement[] = []
  const tl = (
    el: Element | null | undefined,
    frames: Keyframe[],
    opts: KeyframeAnimationOptions & { delay?: number },
  ) => {
    if (!el) return
    anims.push(el.animate(frames, { fill: 'both', easing: EXPO, ...opts }))
  }
  const add = (html: string, parent: Element) => {
    const t = document.createElement('template')
    t.innerHTML = html // fixed markup only, no page or visitor text
    const el = t.content.firstElementChild as HTMLElement
    parent.append(el)
    extras.push(el)
    return el
  }

  const eyebrow = hero.querySelector<HTMLElement>('.eyebrow')
  const h1 = hero.querySelector<HTMLElement>('h1')
  const lines = [...hero.querySelectorAll<HTMLElement>('h1 .line')]
  const header = document.querySelector<HTMLElement>('.site-header')

  // ---- 1. On air
  const standby = add('<div class="intro-standby" aria-hidden="true"></div>', document.body)
  if (header) standby.style.top = `${header.getBoundingClientRect().bottom}px`
  const er = eyebrow?.getBoundingClientRect()
  const sign = add(
    '<span class="intro-onair" aria-hidden="true"><span class="intro-lamp"></span>ON AIR</span>',
    document.body,
  )
  if (er) {
    sign.style.left = `${er.left}px`
    sign.style.top = `${er.top + er.height / 2}px`
  }
  const lamp = sign.querySelector('.intro-lamp')!
  const wash = add('<div class="intro-wash" aria-hidden="true"></div>', document.body)
  const lr = lamp.getBoundingClientRect()
  wash.style.left = `${lr.left + lr.width / 2}px`
  wash.style.top = `${lr.top + lr.height / 2}px`
  const tally = header ? add('<span class="intro-tally" aria-hidden="true"></span>', header) : null

  tl(
    sign,
    [
      { opacity: 0, transform: 'translateY(-50%) scale(0.96)' },
      { opacity: 1, transform: 'translateY(-50%)', offset: 0.1 },
      { opacity: 1, transform: 'translateY(-50%)', offset: 0.8 },
      { opacity: 0, transform: 'translateY(calc(-50% - 6px))' },
    ],
    { duration: 1250, easing: 'linear' },
  )
  // hard on/off cuts, like a real tally lamp
  tl(
    lamp,
    [
      { opacity: 0.15, offset: 0 },
      { opacity: 0.15, offset: 0.24 },
      { opacity: 1, offset: 0.25 },
      { opacity: 1, offset: 0.49 },
      { opacity: 0.15, offset: 0.5 },
      { opacity: 0.15, offset: 0.74 },
      { opacity: 1, offset: 0.75 },
      { opacity: 1, offset: 1 },
    ],
    { duration: 480, easing: 'linear' },
  )
  tl(standby, [{ opacity: 0.84 }, { opacity: 0 }], {
    duration: 380,
    delay: 420,
    easing: 'ease-out',
  })
  tl(
    wash,
    [
      { opacity: 0, transform: 'translate(-50%, -50%) scale(0.05)' },
      { opacity: 1, transform: 'translate(-50%, -50%) scale(0.5)', offset: 0.4 },
      { opacity: 0, transform: 'translate(-50%, -50%) scale(1)' },
    ],
    { duration: 700, delay: 400 },
  )
  tl(
    tally,
    [
      { opacity: 1, transform: 'scaleX(0)' },
      { opacity: 1, transform: 'scaleX(1)', offset: 0.55 },
      { opacity: 0, transform: 'scaleX(1)' },
    ],
    { duration: 760, delay: 440, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' },
  )
  tl(eyebrow, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 1160, easing: 'ease-out' })

  // ---- 2. Level check
  lines.forEach((line, i) => {
    const cur = add('<span class="intro-cursor" aria-hidden="true"></span>', line)
    const w = line.getBoundingClientRect().width
    const delay = 520 + i * 110
    tl(
      line,
      [
        { opacity: 1, clipPath: 'inset(-0.2em 100% -0.2em 0)' },
        { opacity: 1, clipPath: 'inset(-0.2em -0.2em -0.2em 0)' },
      ],
      { duration: 520, delay },
    )
    tl(
      cur,
      [
        { opacity: 1, transform: 'translateX(0)' },
        { opacity: 1, transform: `translateX(${w + 6}px)`, offset: 0.7 },
        { opacity: 0, transform: `translateX(${w + 6}px)` },
      ],
      { duration: 740, delay },
    )
  })
  if (h1) {
    const meter = add(
      `<div class="intro-meter" aria-hidden="true">${'<i></i>'.repeat(24)}</div>`,
      h1,
    )
    tl(meter, [{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], {
      duration: 1240,
      delay: 540,
      easing: 'linear',
    })
    meter.querySelectorAll('i').forEach((seg, i) => {
      const col = i >= 19 ? 'var(--fc-accent)' : 'var(--fc-arc)'
      tl(
        seg,
        [
          { background: 'var(--fc-line-strong)' },
          { background: col, offset: 0.2 },
          { background: col, offset: 0.6 },
          { background: 'var(--fc-line-strong)' },
        ],
        { duration: 760, delay: 560 + i * 16, easing: 'linear' },
      )
    })
  }
  const rise = [
    { opacity: 0, transform: 'translateY(14px)' },
    { opacity: 1, transform: 'none' },
  ]
  tl(hero.querySelector('.lede'), rise, { duration: 520, delay: 860 })
  tl(hero.querySelector('.hero-ctas'), rise, { duration: 520, delay: 960 })

  // ---- end: drop the start states and every helper element
  let ended = false
  const end = () => {
    if (ended) return
    ended = true
    root.classList.remove('intro-hold')
    anims.forEach((a) => a.cancel())
    extras.forEach((el) => el.remove())
    removeEventListener('wheel', skip)
    removeEventListener('touchmove', skip)
    removeEventListener('keydown', skip)
    removeEventListener('pointerdown', skip)
  }
  const skip = () => {
    anims.forEach((a) => a.finish())
    end()
  }
  Promise.all(anims.map((a) => a.finished)).then(end, end)
  for (const ev of ['wheel', 'touchmove', 'keydown', 'pointerdown'] as const)
    addEventListener(ev, skip, { passive: true })
}

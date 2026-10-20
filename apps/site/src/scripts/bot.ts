// Sparky's brain. The pupils follow the cursor all the way to the edge of each eye (smoothed,
// so they stick to it), the face shifts and the head leans toward it, and the face shows a
// mood, by priority:
//   cheer      a `bot:cheer` event on the host (2.4 s): the Download page's thank-you
//   excited    a download link or button is hovered or focused (anything [data-bot-excite])
//   giggle     the bot was clicked or tapped (1.1 s)
//   surprised  the cursor flicked past fast (0.7 s)
//   happy      the cursor is close
//   sleepy     nothing has moved for 8 s
//   neutral    otherwise, with a blink every few seconds
// Under reduced motion the eyes still follow, but nothing hops, sways or tilts. The loop
// stops while the bot is off screen or the tab is hidden.

type Mood = 'neutral' | 'happy' | 'surprised' | 'sleepy' | 'giggle' | 'excited' | 'cheer'

export function mountBot(host: HTMLElement) {
  const svg = host.querySelector<SVGSVGElement>('svg.bot')
  const head = svg?.querySelector<SVGGElement>('.head')
  const face = svg?.querySelector<SVGGElement>('.face')
  if (!svg || !head || !face) return
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  const eyes = [...svg.querySelectorAll<SVGGElement>('.eyes-open .eye')].map((el) => ({
    pupil: el.querySelector<SVGGElement>('.pupil')!,
    rx: Number(el.dataset.rx),
    ry: Number(el.dataset.ry),
  }))

  const ptr = { x: innerWidth / 2, y: innerHeight / 3, speed: 0, t: 0, moved: performance.now() }
  const cur = { px: 0, py: 0, tilt: 0 }
  let excited = 0
  let timed: Mood | '' = ''
  let until = 0
  let mood: Mood = 'neutral'
  let nextBlink = performance.now() + 1800

  addEventListener(
    'pointermove',
    (e) => {
      const now = performance.now()
      const dt = Math.max(1, now - ptr.t)
      ptr.speed = ptr.speed * 0.7 + (Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) / dt) * 0.3
      ptr.x = e.clientX
      ptr.y = e.clientY
      ptr.t = ptr.moved = now
      kick()
    },
    { passive: true },
  )
  addEventListener('scroll', () => ((ptr.moved = performance.now()), kick()), { passive: true })
  host.addEventListener('bot:cheer', () => {
    timed = 'cheer'
    until = performance.now() + 2400
    // Restart the burst if he was already cheering.
    mood = 'neutral'
    svg.dataset.mood = mood
    kick()
  })
  svg.addEventListener('click', () => {
    timed = 'giggle'
    until = performance.now() + 1100
    kick()
  })
  // anything marked as a download: hover or keyboard focus makes the bot excited
  document.querySelectorAll<HTMLElement>('[data-bot-excite]').forEach((el) => {
    const on = () => ((excited += 1), kick())
    const off = () => (excited = Math.max(0, excited - 1))
    el.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && on())
    el.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && off())
    el.addEventListener('focusin', on)
    el.addEventListener('focusout', off)
  })

  const blink = () => {
    svg.classList.add('blink')
    setTimeout(() => svg.classList.remove('blink'), 130)
    if (Math.random() < 0.25)
      setTimeout(() => {
        svg.classList.add('blink')
        setTimeout(() => svg.classList.remove('blink'), 120)
      }, 260)
  }

  let visible = true
  let raf = 0
  const frame = (now: number) => {
    raf = 0
    if (!visible || document.hidden) return
    const r = svg.getBoundingClientRect()
    const s = r.width / 220 || 1
    // aim from between the eyes
    const cx = r.left + r.width / 2
    const cy = r.top + r.height * 0.43
    const dx = ptr.x - cx
    const dy = ptr.y - cy
    const d = Math.hypot(dx, dy) || 1
    // the pupils reach the edge of the eye once the cursor is a hand's width away
    const k = Math.min(1, d / (120 * s))
    const ease = reduce.matches ? 1 : 0.22
    cur.px += ((dx / d) * k - cur.px) * ease
    cur.py += ((dy / d) * k - cur.py) * ease
    const tiltTo = reduce.matches ? 0 : Math.max(-1, Math.min(1, dx / (420 * s))) * 7
    cur.tilt += (tiltTo - cur.tilt) * 0.1
    for (const e of eyes)
      e.pupil.setAttribute(
        'transform',
        `translate(${(cur.px * e.rx).toFixed(2)} ${(cur.py * e.ry).toFixed(2)})`,
      )
    face.setAttribute(
      'transform',
      `translate(${(cur.px * 5).toFixed(2)} ${(cur.py * 4).toFixed(2)})`,
    )
    head.style.transform = `rotate(${cur.tilt.toFixed(2)}deg)`

    let next: Mood = 'neutral'
    const flick = ptr.speed > 2.6 && now - ptr.t < 80
    ptr.speed *= 0.9
    if (timed === 'cheer' && now < until) next = 'cheer'
    else if (excited > 0) next = 'excited'
    else if (timed && now < until) next = timed
    else if (flick) {
      timed = 'surprised'
      until = now + 700
      next = 'surprised'
    } else if (d < 140 * s) next = 'happy'
    else if (now - ptr.moved > 8000) next = 'sleepy'
    if (next !== mood) {
      mood = next
      svg.dataset.mood = mood
    }
    if (now > nextBlink && (mood === 'neutral' || mood === 'happy')) {
      blink()
      nextBlink = now + 2200 + Math.random() * 3200
    }
    raf = requestAnimationFrame(frame)
  }
  function kick() {
    if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame)
  }
  new IntersectionObserver(([e]) => {
    visible = !!e?.isIntersecting
    kick()
  }).observe(svg)
  document.addEventListener('visibilitychange', kick)
  svg.dataset.mood = mood
  kick()
}

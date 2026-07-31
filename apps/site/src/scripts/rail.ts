// Page progress and section links, in two forms that share one set of chapters:
//
// - Spark line (wide screens): a hairline on the right edge. The Molten shard from the logo
//   rides down it as you read and leans with scroll speed; the Arc shard waits at the bottom,
//   and at the end of the page the two meet and the Spark is whole. Each section is a dot you
//   can click (a real link), and the shard can be dragged to scrub the page.
// - Signal dial (tablets and phones): a gain knob in the bottom-right corner that turns as you
//   read, one tick per section. Tap, hover or focus it and the section list opens above it.
//
// CSS decides which one shows; both are kept in step here.
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { gsap } from 'gsap'

gsap.registerPlugin(ScrollTrigger)

interface Chapter {
  el: HTMLElement
  label: string
  id: string
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

// heading text without badges or screen-reader extras ("Pro" not "Pro Launches after...")
function headingText(h: HTMLElement) {
  const c = h.cloneNode(true) as HTMLElement
  c.querySelectorAll('.chip, .sr-only, svg').forEach((x) => x.remove())
  return (c.textContent ?? '').replace(/\s+/g, ' ').trim().replace(/[.:]$/, '')
}

function findChapters(): Chapter[] {
  const main = document.querySelector('main')
  if (!main) return []
  const marked = [...main.querySelectorAll<HTMLElement>('[data-chapter]')]
  const list = marked.length
    ? marked.map((el) => ({ el, label: el.dataset.chapter ?? '' }))
    : [...main.querySelectorAll<HTMLElement>('h2:not(.sr-only)')]
        .map((el) => ({ el, label: headingText(el) }))
        .filter((c) => c.label.length <= 32)
  if (list.length < 2 || list.length > 10) return []
  return list
    .map((c) => {
      if (!c.el.id) {
        const id = slug(c.label)
        if (id && !document.getElementById(id)) c.el.id = id
      }
      return { ...c, id: c.el.id }
    })
    .filter((c) => c.id)
}

const el = (tag: string, cls: string, text?: string) => {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}
const pad = (i: number) => String(i + 1).padStart(2, '0')

export function mountRail() {
  const spark = document.querySelector<HTMLElement>('[data-spark]')
  const dial = document.querySelector<HTMLElement>('[data-dial]')
  if (!spark || !dial) return
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  const chapters = findChapters()

  // ---- Spark line parts
  const track = spark.querySelector<HTMLElement>('.sk-track')!
  const shard = spark.querySelector<HTMLElement>('.sk-m')!
  const now = spark.querySelector<HTMLElement>('.sk-now')!
  const sparkList = spark.querySelector('ol')!
  sparkList.textContent = ''
  const sparkLinks = chapters.map((c) => {
    const li = document.createElement('li')
    const a = document.createElement('a')
    a.href = `#${c.id}`
    a.append(el('span', 'sk-dot'), el('span', 'sk-lab', c.label))
    li.append(a)
    sparkList.append(li)
    return a
  })

  // ---- Signal dial parts
  const knob = dial.querySelector<HTMLButtonElement>('.dl-knob')!
  const ring = dial.querySelector<SVGPathElement>('.dl-ring')!
  const ringBg = dial.querySelector<SVGPathElement>('.dl-ring-bg')!
  const tickGroup = dial.querySelector<SVGGElement>('.dl-ticks')!
  const body = dial.querySelector<HTMLElement>('.dl-body')!
  const dialNow = dial.querySelector<HTMLElement>('[data-dial-now]')!
  const dialList = dial.querySelector('ol')!
  dialList.textContent = ''
  const dialLinks = chapters.map((c, i) => {
    const li = document.createElement('li')
    const a = document.createElement('a')
    a.href = `#${c.id}`
    a.append(el('span', 'dl-num', pad(i)), el('span', 'dl-lab', c.label))
    li.append(a)
    dialList.append(li)
    return a
  })
  // a 270 degree sweep, open at the bottom
  const C = 38,
    R = 33,
    A0 = -135,
    SWEEP = 270
  const pt = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180
    return [C + r * Math.cos(a), C + r * Math.sin(a)] as const
  }
  const [sx, sy] = pt(A0, R)
  const [ex, ey] = pt(A0 + SWEEP, R)
  const arcD = `M${sx.toFixed(2)} ${sy.toFixed(2)} A${R} ${R} 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`
  ring.setAttribute('d', arcD)
  ringBg.setAttribute('d', arcD)
  const LEN = (2 * Math.PI * R * SWEEP) / 360
  ring.style.strokeDasharray = `${LEN}`
  ring.style.strokeDashoffset = `${LEN}`
  const ticks = chapters.map(() => {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    l.setAttribute('class', 'dl-tick')
    tickGroup.append(l)
    return l
  })

  // ---- measuring
  let L = 1,
    shardH = 1,
    max = 1,
    tops: number[] = [],
    active = -2,
    lastP = -1,
    y = 0
  const at = (i: number) => Math.min(1, Math.max(0, ((tops[i] ?? 0) - innerHeight * 0.4) / max))
  const measure = () => {
    max = Math.max(1, document.documentElement.scrollHeight - innerHeight)
    const scrollable = max > 240
    spark.hidden = !scrollable
    dial.hidden = !scrollable || chapters.length === 0
    L = Math.max(1, track.clientHeight)
    shardH = shard.getBoundingClientRect().height || 1
    tops = chapters.map((c) => c.el.getBoundingClientRect().top + scrollY)
    // each dot sits where the shard will be when that section becomes current, kept apart
    let prev = -Infinity
    sparkLinks.forEach((a, i) => {
      let p = Math.max(shardH / 2 + at(i) * (L - shardH), prev + 26)
      p = Math.min(p, L)
      prev = p
      a.style.setProperty('--at', `${p.toFixed(1)}px`)
    })
    ticks.forEach((l, i) => {
      const deg = A0 + SWEEP * at(i)
      const [x0, y0] = pt(deg, R + 5)
      const [x1, y1] = pt(deg, R + 9)
      l.setAttribute('x1', x0.toFixed(2))
      l.setAttribute('y1', y0.toFixed(2))
      l.setAttribute('x2', x1.toFixed(2))
      l.setAttribute('y2', y1.toFixed(2))
    })
    lastP = -1
    active = -2
  }

  // ---- the shard leans with scroll speed and eases back upright
  let tilt = 0,
    lastY = 0,
    leanRaf = 0
  const lean = () => {
    leanRaf = 0
    const v = y - lastY
    lastY = y
    tilt += (Math.max(-18, Math.min(18, v * 2.2)) - tilt) * 0.25
    shard.style.setProperty('--tilt', `${tilt.toFixed(2)}deg`)
    if (Math.abs(tilt) > 0.05 || Math.abs(v) > 0.01) leanRaf = requestAnimationFrame(lean)
    else shard.style.setProperty('--tilt', '0deg')
  }
  // the "now" name shows while scrolling and fades a moment after you stop
  let quietT = 0
  const wake = () => {
    spark.classList.add('moving')
    clearTimeout(quietT)
    quietT = window.setTimeout(() => spark.classList.remove('moving'), 1100)
  }

  const draw = (p: number) => {
    if (Math.abs(p - lastP) < 0.0004) return
    const moved = lastP >= 0
    lastP = p
    y = p * (L - shardH)
    spark.style.setProperty('--y', `${y.toFixed(1)}px`)
    spark.style.setProperty('--p', ((y + shardH / 2) / L).toFixed(4))
    spark.classList.toggle('whole', p > 0.995)
    body.style.setProperty('--deg', `${(A0 + SWEEP * p).toFixed(1)}deg`)
    ring.style.strokeDashoffset = (LEN * (1 - p)).toFixed(2)
    dial.classList.toggle('away', scrollY < innerHeight * 0.5)
    if (moved && !reduce.matches) {
      wake()
      if (!leanRaf) leanRaf = requestAnimationFrame(lean)
    }
    // the current section: the last one whose top has passed 40% of the viewport
    const line = scrollY + innerHeight * 0.4 + 1
    let a = -1
    tops.forEach((t, i) => {
      if (line >= t) a = i
    })
    if (a === active) return
    active = a
    for (const links of [sparkLinks, dialLinks])
      links.forEach((link, i) => {
        if (i === a) link.setAttribute('aria-current', 'location')
        else link.removeAttribute('aria-current')
        link.classList.toggle('past', i < a)
      })
    ticks.forEach((t, i) => {
      t.classList.toggle('past', i < a)
      t.classList.toggle('cur', i === a)
    })
    const label = chapters[a]?.label ?? chapters[0]?.label ?? ''
    now.textContent = label
    dialNow.textContent = label
  }

  // ---- drag the shard to scrub through the page
  shard.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    shard.setPointerCapture(e.pointerId)
    spark.classList.add('dragging')
    const r = track.getBoundingClientRect()
    const grab = e.clientY - shard.getBoundingClientRect().top
    const move = (ev: PointerEvent) => {
      const f = Math.min(1, Math.max(0, (ev.clientY - grab - r.top) / Math.max(1, L - shardH)))
      window.scrollTo({ top: f * max, behavior: 'instant' })
    }
    const up = () => {
      spark.classList.remove('dragging')
      shard.removeEventListener('pointermove', move)
      shard.removeEventListener('pointerup', up)
      shard.removeEventListener('pointercancel', up)
    }
    shard.addEventListener('pointermove', move)
    shard.addEventListener('pointerup', up)
    shard.addEventListener('pointercancel', up)
  })

  // ---- the dial's list: opens on mouse hover, keyboard focus, or a click/tap (then it stays
  // open until dismissed). Escape closes it and keeps focus on the knob.
  let pinned = false,
    hover = false,
    focus = false,
    muted = false
  const sync = () => {
    const open = pinned || hover || focus
    dial.classList.toggle('open', open)
    knob.setAttribute('aria-expanded', String(open))
  }
  const closeAll = () => {
    pinned = hover = focus = false
    sync()
  }
  dial.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return
    hover = true
    sync()
  })
  dial.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return
    hover = false
    sync()
  })
  dial.addEventListener('focusin', (e) => {
    if (muted) return
    focus = e.target !== knob || knob.matches(':focus-visible')
    sync()
  })
  dial.addEventListener('focusout', (e) => {
    if (dial.contains(e.relatedTarget as Node | null)) return
    muted = false
    focus = pinned = false
    sync()
  })
  knob.addEventListener('click', () => {
    if (dial.classList.contains('open') && (pinned || !hover)) {
      closeAll()
      muted = true
    } else {
      pinned = true
      muted = false
      sync()
    }
  })
  dialLinks.forEach((a) =>
    a.addEventListener('click', () => {
      muted = true
      closeAll()
    }),
  )
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !dial.classList.contains('open')) return
    muted = true
    knob.focus()
    closeAll()
  })
  document.addEventListener('pointerdown', (e) => {
    if (dial.contains(e.target as Node)) return
    pinned = false
    sync()
  })

  ScrollTrigger.addEventListener('refreshInit', measure)
  ScrollTrigger.create({
    trigger: document.documentElement,
    start: 0,
    end: 'max',
    onUpdate: (self) => draw(self.progress),
    onRefresh: (self) => {
      measure()
      draw(self.progress)
    },
  })
  let rT = 0
  new ResizeObserver(() => {
    clearTimeout(rT)
    rT = window.setTimeout(() => ScrollTrigger.refresh(), 150)
  }).observe(document.body)
  measure()
  draw(Math.min(1, scrollY / max))
  spark.classList.add('on')
  dial.classList.add('on')
}

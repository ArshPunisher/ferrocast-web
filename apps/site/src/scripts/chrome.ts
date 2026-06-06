// Scroll chrome shared by every page: the right-edge ruler with a % readout and the
// rotating section sidebar (upcoming sections stacked bottom-right, the current one turned
// up into a vertical label, the previous one flipped up to the top).
// Driven by GSAP ScrollTrigger; purely decorative, so it is aria-hidden.
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

interface Chapter { el: HTMLElement; label: string }

function findChapters(): Chapter[] {
  const main = document.querySelector('main')
  if (!main) return []
  const marked = [...main.querySelectorAll<HTMLElement>('[data-chapter]')]
  if (marked.length) return marked.map((el) => ({ el, label: el.dataset.chapter ?? '' }))
  // Fallback: short h2 headings become chapters (docs and legal pages)
  const hs = [...main.querySelectorAll<HTMLElement>('h2')].filter((h) => (h.textContent ?? '').trim().length <= 26)
  if (hs.length < 2 || hs.length > 9) return []
  return hs.map((h) => ({ el: h, label: (h.textContent ?? '').trim().replace(/[.:]$/, '') }))
}

export function mountChrome() {
  const ruler = document.querySelector<HTMLElement>('.fc-ruler')
  const side = document.querySelector<HTMLElement>('.fc-side')
  if (!ruler || !side) return
  const ind = ruler.querySelector<HTMLElement>('.ind')
  const read = ruler.querySelector<HTMLElement>('.read')
  const chapters = findChapters()

  side.textContent = ''
  const labs = chapters.map((c) => {
    const s = document.createElement('span')
    s.className = 'fc-lab next'
    s.textContent = c.label
    side.append(s)
    return s
  })
  side.classList.toggle('on', labs.length > 0)

  let tops: number[] = []
  let rulerH = 1
  let sideH = 1
  let active = -2
  let lastRead = ''
  const measure = () => {
    tops = chapters.map((c) => c.el.getBoundingClientRect().top + scrollY)
    rulerH = ruler.clientHeight
    sideH = side.clientHeight
    active = -2
  }

  const layout = (a: number) => {
    const n = labs.length
    labs.forEach((el, i) => {
      let tr: string
      let op = 1
      let cls: string
      if (i < a - 1) { tr = 'translate3d(0,-18px,0) rotateX(85deg)'; op = 0; cls = 'past' }
      else if (i === a - 1) { tr = 'translate3d(0,0,0) rotateX(0deg)'; cls = 'past' }
      else if (i === a) { tr = `translate3d(0,${(sideH * 0.46).toFixed(1)}px,0) rotate(-90deg) scale(1.3)`; cls = 'active' }
      else {
        const up = n - 1 - a, k = i - a - 1
        tr = `translate3d(0,${(sideH - 14 - (up - 1 - k) * 21).toFixed(1)}px,0) rotate(0deg)`
        cls = 'next'
      }
      el.style.transform = tr
      el.style.opacity = String(op)
      el.className = `fc-lab ${cls}`
    })
  }

  const update = (progress: number) => {
    if (ind) ind.style.transform = `translate3d(0,${(progress * rulerH).toFixed(1)}px,0)`
    const txt = `${String(Math.round(progress * 100)).padStart(3, '0')} %`
    if (read && txt !== lastRead) { read.textContent = txt; lastRead = txt }
    const line = scrollY + innerHeight * 0.55
    let a = -1
    tops.forEach((t, i) => { if (line >= t) a = i })
    if (a !== active) { active = a; layout(a) }
  }

  ScrollTrigger.addEventListener('refreshInit', measure)
  ScrollTrigger.create({
    trigger: document.documentElement,
    start: 0,
    end: 'max',
    onUpdate: (self) => update(self.progress),
    onRefresh: (self) => { measure(); update(self.progress) },
  })
  measure()
  update(ScrollTrigger.maxScroll(window) ? scrollY / ScrollTrigger.maxScroll(window) : 0)
}

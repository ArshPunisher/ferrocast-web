// The Ferrocast Spark mark as created SVG elements (no HTML strings). Built-in designs carry
// it small, somewhere it looks part of the design; the streamer's own designs never do.

import { SPARK } from '@ferrocast/ui/brand'

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * The mark: an `f` (currentColor) and the split shard (molten over arc). Keeps the legacy
 * `al-spikes` / `al-magnet` class names on request, because streamers' custom CSS targets them.
 */
export function sparkSvg(className: string, legacy = false): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 64 64')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('class', legacy ? `${className} al-spikes` : className)
  const f = document.createElementNS(SVG_NS, 'path')
  f.setAttribute('d', SPARK.f)
  f.setAttribute('class', legacy ? 'f al-spark-f' : 'f')
  svg.appendChild(f)
  const shard = document.createElementNS(SVG_NS, 'g')
  shard.setAttribute('class', legacy ? 'sh al-magnet' : 'sh')
  for (const [d, cls] of [
    [SPARK.boltTop, 'sh-top'],
    [SPARK.boltBottom, 'sh-bottom'],
  ] as const) {
    const p = document.createElementNS(SVG_NS, 'path')
    p.setAttribute('d', d)
    p.setAttribute(
      'class',
      legacy ? `${cls} ${cls === 'sh-top' ? 'al-spark-molten' : 'al-spark-arc'}` : cls,
    )
    shard.appendChild(p)
  }
  svg.appendChild(shard)
  return svg
}

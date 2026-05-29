// The Ferrocast mark, "Spark": a liquid lowercase f (ferro, cast metal) throwing a lightning
// shard that is split along its own diagonal. One geometry for every surface: the React
// components, the site, the Open Graph card, the favicons, the app icon and the tray icon
// (brand/build.mjs) all come from here.
//
// Colours: the f is ink; the shard's upper half is molten amber, the lower half arc cyan.
// Inline copies use CSS variables (--fc-brand-molten, --fc-brand-arc) so they follow the
// theme; files and raster images use the fixed values in BRAND_PAINT.

// (No imports, so brand/build.mjs can run this file directly in Node.)

type Pt = readonly [number, number]
const r2 = (n: number) => Math.round(n * 100) / 100

export interface BrandPaint {
  /** The f and the wordmark letters. */
  ink: string
  /** Upper half of the shard, and the live dot in the wordmark's o. */
  molten: string
  /** Lower half of the shard. */
  arc: string
}

export const BRAND_PAINT: { dark: BrandPaint; light: BrandPaint } = {
  dark: { ink: '#eef0f4', molten: '#ffa424', arc: '#33d4ff' },
  light: { ink: '#0e1014', molten: '#cf7400', arc: '#0888b8' },
}

/** For inline SVG in the apps: follows the theme through the tokens. */
export const BRAND_PAINT_THEMED: BrandPaint = {
  ink: 'currentColor',
  molten: 'var(--fc-brand-molten)',
  arc: 'var(--fc-brand-arc)',
}

/* ---------------------------------------------------------------- geometry */

/** The lightning bolt the shard is drawn from (a 40 x 56 box). */
const BOLT: Pt[] = [
  [40, 4],
  [12, 38],
  [30, 38],
  [23, 60],
  [52, 26],
  [34, 26],
]
/** The split runs through the bolt's two outer corners, (12,38) and (52,26). */
const cutY = (x: number) => 38 + ((26 - 38) / (52 - 12)) * (x - 12)

/** Keeps the part of `poly` above (side -1) or below (side 1) the cut, offset by `gap`. */
function clip(poly: Pt[], side: -1 | 1, gap: number): Pt[] {
  const s = (p: Pt) => side * (p[1] - (cutY(p[0]) + side * gap))
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Pt
    const b = poly[(i + 1) % poly.length] as Pt
    const sa = s(a)
    const sb = s(b)
    if (sa >= 0) out.push(a)
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

interface FSpec {
  /** Stroke weight of the stem and hook. */
  w: number
  /** Right end of the crossbar. */
  bar: number
  barY: number
  barH: number
  /** Right end of the hook's terminal. */
  term: number
}
const F_FULL: FSpec = { w: 9, bar: 36.5, barY: 26, barH: 8, term: 42.5 }
/** Heavier f for 32 px and below, so the counters stay open. */
const F_SMALL: FSpec = { w: 10.5, bar: 35, barY: 25.5, barH: 9, term: 41 }

function fPath(f: FSpec, dx: number, dy: number): string {
  const h = f.w / 2
  const R = 11 + h
  const r = 11 - h
  const X = (v: number) => r2(v + dx)
  const Y = (v: number) => r2(v + dy)
  return (
    `M${X(25 - h)} ${Y(55)}V${Y(25.5)}A${R} ${R} 0 0 1 ${X(36)} ${Y(14.5 - h)}H${X(f.term)}V${Y(14.5 + h)}H${X(36)}A${r} ${r} 0 0 0 ${X(25 + h)} ${Y(25.5)}V${Y(55)}Z` +
    `M${X(14)} ${Y(f.barY)}H${X(f.bar)}V${Y(f.barY + f.barH)}H${X(14)}Z`
  )
}

const placeBolt = (pts: Pt[], tx: number, ty: number, s: number): Pt[] =>
  pts.map(([x, y]) => [tx + x * s, ty + y * s] as const)
const polyPath = (pts: Pt[], dx: number, dy: number) =>
  `M${pts.map(([x, y]) => `${r2(x + dx)} ${r2(y + dy)}`).join('L')}Z`

/** Offset that centres the f plus the given shard points in the 64 x 64 box. */
function centre(f: FSpec, pts: Pt[]): [number, number] {
  const xs = [14, f.term, ...pts.map((p) => p[0])]
  const ys = [14.5 - f.w / 2, 55, ...pts.map((p) => p[1])]
  return [32 - (Math.min(...xs) + Math.max(...xs)) / 2, 32 - (Math.min(...ys) + Math.max(...ys)) / 2]
}

function buildFull() {
  const top = placeBolt(clip(BOLT, -1, 2), 30, 19.5, 0.53)
  const bottom = placeBolt(clip(BOLT, 1, 2), 30, 19.5, 0.53)
  const pts = [...top, ...bottom]
  const [dx, dy] = centre(F_FULL, pts)
  const xs = [14, F_FULL.term, ...pts.map((p) => p[0])]
  const ys = [14.5 - F_FULL.w / 2, 55, ...pts.map((p) => p[1])]
  return {
    f: fPath(F_FULL, dx, dy),
    boltTop: polyPath(top, dx, dy),
    boltBottom: polyPath(bottom, dx, dy),
    /** Ink bounds inside the 64 x 64 box. */
    box: {
      x: r2(Math.min(...xs) + dx),
      y: r2(Math.min(...ys) + dy),
      width: r2(Math.max(...xs) - Math.min(...xs)),
      height: r2(Math.max(...ys) - Math.min(...ys)),
    },
  }
}
function buildSmall() {
  const bolt = placeBolt(BOLT, 30.5, 17.5, 0.6)
  const [dx, dy] = centre(F_SMALL, bolt)
  return { f: fPath(F_SMALL, dx, dy), bolt: polyPath(bolt, dx, dy) }
}

/** The full mark in a 64 x 64 box: f, upper shard, lower shard. */
export const SPARK = buildFull()
/** The small-size mark (32 px and below, and the mono tray icon): heavier f, unsplit shard. */
export const SPARK_SMALL = buildSmall()

/* ---------------------------------------------------------------- SVG strings */

const fill = (c: string) => `style="fill:${c}"`

/** The mark's shapes (no <svg> wrapper), in the 64 x 64 box. */
export function sparkShapes(paint: BrandPaint, opts: { small?: boolean } = {}): string {
  if (opts.small)
    return `<path d="${SPARK_SMALL.f}" ${fill(paint.ink)}/><path d="${SPARK_SMALL.bolt}" ${fill(paint.arc)}/>`
  return `<path d="${SPARK.f}" ${fill(paint.ink)}/><path d="${SPARK.boltTop}" ${fill(paint.molten)}/><path d="${SPARK.boltBottom}" ${fill(paint.arc)}/>`
}

/** A one-colour mark for the menu bar, favicons masks and other mono uses. */
export function sparkMonoShapes(color = 'currentColor', opts: { small?: boolean } = { small: true }): string {
  return sparkShapes({ ink: color, molten: color, arc: color }, opts)
}

export function sparkSvg(
  paint: BrandPaint,
  opts: { small?: boolean; size?: number; title?: string } = {},
): string {
  const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : ''
  const a11y = opts.title ? ` role="img" aria-label="${opts.title}"` : ' aria-hidden="true"'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${size}${a11y}>${sparkShapes(paint, opts)}</svg>`
}

/** The outlined wordmark's shapes in font units (see WORDMARK_BOX). `id` names the notch mask. */
export function wordmarkShapes(paint: BrandPaint, id: string): string {
  const { cx, cy, notch, dot } = WORDMARK_LIVE
  return (
    `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="${WORDMARK_BOX.x - 50}" y="0" width="${WORDMARK_BOX.width + 100}" height="800">` +
    `<rect x="${WORDMARK_BOX.x - 50}" width="${WORDMARK_BOX.width + 100}" height="800" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="${notch}" fill="#000"/></mask></defs>` +
    `<path d="${WORDMARK_LETTERS}" ${fill(paint.ink)}/>` +
    `<path d="${WORDMARK_O}" ${fill(paint.ink)} mask="url(#${id})"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${dot}" ${fill(paint.molten)}/>`
  )
}

export function wordmarkSvg(paint: BrandPaint, opts: { id: string; height?: number; title?: string }): string {
  const b = WORDMARK_BOX
  const vb = `-10 ${b.y} ${b.width + 20} ${b.height}`
  const h = opts.height
  const size = h ? ` width="${r2(((b.width + 20) / b.height) * h)}" height="${h}"` : ''
  const a11y = opts.title ? ` role="img" aria-label="${opts.title}"` : ' aria-hidden="true"'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${size}${a11y}>${wordmarkShapes(paint, opts.id)}</svg>`
}

/**
 * Mark + wordmark. The mark is drawn 15% taller than the wordmark's f and centred on it,
 * with a gap of about a third of an em. Returns the viewBox too, for callers that size it.
 */
export function lockupParts(paint: BrandPaint, id: string): { viewBox: string; width: number; height: number; inner: string } {
  const b = WORDMARK_BOX
  const m = SPARK.box
  const k = ((b.baseline - b.ascender) / m.height) * 1.15
  const markTop = (b.ascender + b.baseline) / 2 - (m.y + m.height / 2) * k
  const markLeft = -m.x * k
  const gap = 300
  const wordX = r2(m.width * k + gap)
  const pad = 24
  const top = r2(Math.min(b.y, markTop + m.y * k) - pad)
  const bottom = r2(Math.max(b.y + b.height, markTop + (m.y + m.height) * k) + pad)
  const width = r2(wordX + b.width + 2 * pad)
  const inner =
    `<g transform="translate(${r2(markLeft)} ${r2(markTop)}) scale(${r2(k)})">${sparkShapes(paint)}</g>` +
    `<g transform="translate(${wordX} 0)">${wordmarkShapes(paint, id)}</g>`
  return { viewBox: `${-pad} ${top} ${width} ${r2(bottom - top)}`, width, height: r2(bottom - top), inner }
}

export function lockupSvg(paint: BrandPaint, opts: { id: string; height?: number; title?: string }): string {
  const l = lockupParts(paint, opts.id)
  const h = opts.height
  const size = h ? ` width="${r2((l.width / l.height) * h)}" height="${h}"` : ''
  const a11y = opts.title ? ` role="img" aria-label="${opts.title}"` : ' aria-hidden="true"'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${l.viewBox}"${size}${a11y}>${l.inner}</svg>`
}

/* ---------------------------------------------------------------- wordmark data */

// <generated:wordmark> from Bricolage Grotesque 700 (SIL OFL), outlined and hand-kerned,
// in font units with the baseline at y = 740 (y down). Regenerate, don't edit by hand.

/** Every letter except the o, as one path. */
export const WORDMARK_LETTERS = "M106 740L106 404L23 404L23 298L163 304L163 285Q128 277 105.5 259.5Q83 242 73 217Q63 192 63 164Q63 121 85 89.5Q107 58 147 40.5Q187 23 241 23Q287 23 324.5 34.5Q362 46 385 63L376 193Q352 176 322 165Q292 154 265 154Q235 154 215.5 170Q196 186 196 222Q196 247 206.5 261.5Q217 276 232.5 282.5Q248 289 263 291L383 291L383 404L246 404L246 740ZM677 754Q612 754 561.5 736Q511 718 476 684Q441 650 422.5 600Q404 550 404 487Q404 425 421.5 372.5Q439 320 473 281.5Q507 243 556 222Q605 201 667 201Q727 201 774 220.5Q821 240 852.5 279Q884 318 898.5 374.5Q913 431 909 504L542 508Q546 575 579 609Q616 649 677 649Q705 649 724.5 641.5Q744 634 756.5 622Q769 610 776.5 595Q784 580 789 565L914 592Q905 629 887.5 658.5Q870 688 841 709.5Q812 731 771.5 742.5Q731 754 677 754ZM546 429L777 426Q776 399 768 379Q754 345 727.5 329Q701 313 669 313Q631 313 602 333Q573 353 557 391Q550 409 546 429ZM984 740L984 215L1103 215L1104 394L1123 394Q1131 327 1150.5 285Q1170 243 1205 223Q1240 203 1292 203Q1301 203 1311.5 203.5Q1322 204 1336 207L1330 360Q1315 353 1297 350Q1279 347 1265 347Q1226 347 1198 365Q1170 383 1152.5 416.5Q1135 450 1129 498L1129 740ZM1374 740L1374 215L1493 215L1494 394L1513 394Q1521 327 1540.5 285Q1560 243 1595 223Q1630 203 1682 203Q1691 203 1701.5 203.5Q1712 204 1726 207L1720 360Q1705 353 1687 350Q1669 347 1655 347Q1616 347 1588 365Q1560 383 1542.5 416.5Q1525 450 1519 498L1519 740ZM2600 754Q2532 754 2481 734Q2430 714 2396 678Q2362 642 2345 592.5Q2328 543 2328 484Q2328 422 2345.5 370.5Q2363 319 2397 281Q2431 243 2481 222Q2531 201 2595 201Q2659 201 2706.5 222Q2754 243 2783.5 280.5Q2813 318 2824 369L2691 412Q2688 381 2674.5 358.5Q2661 336 2638.5 324.5Q2616 313 2588 313Q2559 313 2538 324.5Q2517 336 2502.5 357.5Q2488 379 2480.5 409.5Q2473 440 2473 478Q2473 532 2487.5 569.5Q2502 607 2530.5 626.5Q2559 646 2601 646Q2641 646 2665 630.5Q2689 615 2700.5 590.5Q2712 566 2715 540L2841 568Q2836 607 2819.5 641Q2803 675 2773 700Q2743 725 2700.5 739.5Q2658 754 2600 754ZM3016 754Q2972 754 2938 736.5Q2904 719 2885 686Q2866 653 2866 604Q2866 561 2882.5 532Q2899 503 2931 485Q2963 467 3010 455Q3057 443 3117 434Q3149 429 3169.5 424.5Q3190 420 3200 409.5Q3210 399 3210 379Q3210 351 3190 331Q3170 311 3127 311Q3098 311 3073.5 321Q3049 331 3031.5 351Q3014 371 3006 402L2879 363Q2891 322 2913.5 292Q2936 262 2968 241.5Q3000 221 3041 211Q3082 201 3130 201Q3207 201 3255.5 225.5Q3304 250 3328 301.5Q3352 353 3352 434L3352 524Q3352 559 3353.5 595Q3355 631 3357.5 667.5Q3360 704 3363 740L3236 740Q3232 715 3228.5 682.5Q3225 650 3223 617L3205 617Q3191 655 3165 686Q3139 717 3101.5 735.5Q3064 754 3016 754ZM3077 650Q3096 650 3115.5 643Q3135 636 3153.5 623.5Q3172 611 3187.5 592Q3203 573 3213 549L3211 483Q3202 487 3192 490Q3168 498 3142.5 502Q3117 506 3092 511Q3067 516 3047.5 524Q3028 532 3016.5 545.5Q3005 559 3005 583Q3005 614 3025 632Q3045 650 3077 650ZM3658 754Q3605 754 3562 744Q3519 734 3488 715Q3457 696 3438 669.5Q3419 643 3413 610L3523 565Q3527 587 3545 606Q3563 625 3593.5 636.5Q3624 648 3667 648Q3713 648 3738 634.5Q3763 621 3763 596Q3763 577 3749 566Q3735 555 3708 547Q3681 539 3643 532Q3606 523 3567.5 513Q3529 503 3496.5 485Q3464 467 3443.5 437.5Q3423 408 3423 362Q3423 314 3449 278Q3475 242 3525 221.5Q3575 201 3647 201Q3712 201 3761 218.5Q3810 236 3841.5 268.5Q3873 301 3884 346L3767 385Q3763 361 3747.5 343Q3732 325 3706.5 316Q3681 307 3647 307Q3604 307 3580.5 321Q3557 335 3557 358Q3557 377 3572.5 389Q3588 401 3616 408.5Q3644 416 3682 424Q3722 432 3760 442.5Q3798 453 3828.5 470Q3859 487 3877 515Q3895 543 3895 587Q3895 639 3867 676.5Q3839 714 3786 734Q3733 754 3658 754ZM4153 752Q4065 752 4023.5 705.5Q3982 659 3982 557L3982 328L3906 328L3908 215L3961 215Q3992 215 4007 206Q4022 197 4025 173L4038 98L4120 98L4120 215L4253 215L4253 332L4120 332L4120 551Q4120 587 4137 603Q4154 619 4189 619Q4208 619 4225.5 615Q4243 611 4256 602L4256 736Q4225 746 4199 749Q4173 752 4153 752Z"

/** The o on its own, so the live notch can be cut out of it. */
export const WORDMARK_O = "M2018 754Q1939 754 1879 722.5Q1819 691 1785 629.5Q1751 568 1751 476Q1751 384 1785.5 323Q1820 262 1880.5 231.5Q1941 201 2018 201Q2097 201 2157.5 232Q2218 263 2252.5 324.5Q2287 386 2287 478Q2287 571 2251.5 632.5Q2216 694 2155.5 724Q2095 754 2018 754ZM2023 647Q2062 647 2088.5 629Q2115 611 2128.5 574.5Q2142 538 2142 486Q2142 431 2127.5 392.5Q2113 354 2085 333.5Q2057 313 2014 313Q1977 313 1950 330.5Q1923 348 1909 384.5Q1895 421 1895 474Q1895 559 1929 603Q1963 647 2023 647Z"

/** The live dot that sits in a notch on the o's upper right shoulder. */
export const WORDMARK_LIVE = { cx: 2144.3, cy: 308.7, notch: 104, dot: 66 }

/** Ink box of the wordmark: x from 0, y from the f's top to just under the baseline. */
export const WORDMARK_BOX = { x: 0, y: 17, width: 4289, height: 743, baseline: 740, ascender: 23 }
// </generated:wordmark>

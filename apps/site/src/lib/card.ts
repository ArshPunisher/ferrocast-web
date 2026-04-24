// Share cards (1200×630 PNG) rendered with satori + resvg at build time. Also used by
// scripts/poster-standins.ts for video posters until the Remotion renders exist.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { SPIKE_MARK_PATH, MARK_MAGNET } from '../../../../packages/ui/src/ferro/mark.ts'

const require = createRequire(import.meta.url)
const font = (family: string, weight: number) =>
  readFileSync(require.resolve(`@fontsource/${family}/files/${family}-latin-${weight}-normal.woff`))

let fonts: { name: string; data: Buffer; weight: 400 | 600 | 700; style: 'normal' }[] | null = null
function loadFonts() {
  fonts ??= [
    { name: 'Bricolage', data: font('bricolage-grotesque', 700), weight: 700, style: 'normal' },
    { name: 'Hanken', data: font('hanken-grotesk', 400), weight: 400, style: 'normal' },
    { name: 'Hanken', data: font('hanken-grotesk', 600), weight: 600, style: 'normal' },
  ]
  return fonts
}

const markSvg = (size: number) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">
      <defs><linearGradient id="c" x1="0" y1="14" x2="0" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#ffffff"/><stop offset="0.32" stop-color="#c3cad6"/>
        <stop offset="0.62" stop-color="#4a515d"/><stop offset="0.82" stop-color="#14171c"/>
        <stop offset="1" stop-color="#2c323b"/></linearGradient>
      <linearGradient id="r" x1="0" y1="50" x2="0" y2="60" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#3461f5" stop-opacity="0"/><stop offset="1" stop-color="#3461f5" stop-opacity="0.55"/></linearGradient></defs>
      <path d="${SPIKE_MARK_PATH}" fill="url(#c)"/><path d="${SPIKE_MARK_PATH}" fill="url(#r)"/>
      <circle cx="${MARK_MAGNET.cx}" cy="${MARK_MAGNET.cy}" r="${MARK_MAGNET.r}" fill="#3461f5"/>
    </svg>`,
  ).toString('base64')}`

type Node = { type: string; props: Record<string, unknown> }
const h = (
  type: string,
  style: Record<string, unknown>,
  children?: unknown,
  extra: Record<string, unknown> = {},
): Node => ({
  type,
  props: { style, children, ...extra },
})

export interface CardOptions {
  kicker: string
  title: string
  width?: number
  height?: number
}

export async function renderCard({
  kicker,
  title,
  width = 1200,
  height = 630,
}: CardOptions): Promise<Buffer> {
  const scale = width / 1200
  const tree = h(
    'div',
    {
      width,
      height,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      paddingBottom: 110 * (width / 1200),
      padding: 72 * scale,
      backgroundColor: '#0a0b0d',
      backgroundImage:
        'radial-gradient(circle at 82% 78%, rgba(52,97,245,0.38) 0%, rgba(52,97,245,0) 42%), linear-gradient(160deg, #15181d 0%, #0a0b0d 55%, #07080a 100%)',
      color: '#eef0f4',
      fontFamily: 'Hanken',
      position: 'relative',
    },
    [
      h(
        'img',
        { position: 'absolute', left: 790 * scale, top: 140 * scale, opacity: 0.92 },
        undefined,
        {
          src: markSvg(330),
          width: 330 * scale,
          height: 330 * scale,
        },
      ),
      h('div', { display: 'flex', alignItems: 'center', gap: 18 * scale }, [
        h('img', { width: 64 * scale, height: 64 * scale }, undefined, {
          src: markSvg(64),
          width: 64 * scale,
          height: 64 * scale,
        }),
        h(
          'div',
          { fontFamily: 'Bricolage', fontSize: 40 * scale, letterSpacing: -1.2 * scale },
          'ferrocast',
        ),
      ]),
      h(
        'div',
        { display: 'flex', flexDirection: 'column', gap: 20 * scale, maxWidth: 760 * scale },
        [
          h('div', { fontSize: 30 * scale, fontWeight: 600, color: '#8eaaff' }, kicker),
          h(
            'div',
            {
              fontFamily: 'Bricolage',
              fontSize: (title.length > 24 ? 72 : 84) * scale,
              lineHeight: 1.02,
              letterSpacing: -3 * scale,
            },
            title,
          ),
        ],
      ),
    ],
  )
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    width,
    height,
    fonts: loadFonts(),
  })
  return new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng()
}

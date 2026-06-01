// Share cards (1200×630 PNG) rendered with satori + resvg at build time. Also used by
// scripts/poster-standins.ts for video posters until the Remotion renders exist.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { BRAND_PAINT, lockupParts, lockupSvg, sparkSvg } from '../../../../packages/ui/src/brand.ts'

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

const dataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
const markSvg = (size: number) => dataUri(sparkSvg(BRAND_PAINT.dark, { size }))
const LOCKUP_H = 56
const lockupRatio = (() => {
  const l = lockupParts(BRAND_PAINT.dark, 'card-o')
  return l.width / l.height
})()
const lockup = (h: number) => dataUri(lockupSvg(BRAND_PAINT.dark, { id: 'card-o', height: h }))

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
        'radial-gradient(circle at 80% 46%, rgba(255,164,36,0.16) 0%, rgba(255,164,36,0) 40%), linear-gradient(160deg, #15181d 0%, #0a0b0d 55%, #07080a 100%)',
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
      h('div', { display: 'flex' }, [
        h('img', { width: LOCKUP_H * lockupRatio * scale, height: LOCKUP_H * scale }, undefined, {
          src: lockup(Math.round(LOCKUP_H * scale)),
          width: LOCKUP_H * lockupRatio * scale,
          height: LOCKUP_H * scale,
        }),
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

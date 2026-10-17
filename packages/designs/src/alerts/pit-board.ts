// Pit board: the board a crew holds over the wall. A carbon plate slides in from the side
// behind a racing red P1 block, italic capitals, a teal telemetry line under them and a
// chequered strip along the bottom. The Spark rides the plate's far edge.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'pit-board',
    name: 'Pit board',
    description: 'A carbon pit board with a red P1 block, italic capitals and a chequered strip.',
    style: 'tech',
    motion: 'smooth',
  },
  {
    frame: 'plate',
    layout: 'left',
    media_size: 120,
    font: font('Oswald', 48, 700, { uppercase: true, italic: true }),
    colors: colors('#f5f5f7', '#00d2be', '#15161b', '#e10600', '#0c0d10'),
    shadow: 'none',
    anim: motion('slide_left', 'slide_right', 'none', 550, 400, 200),
    sound: { ref: null, builtin: 'whoosh', volume: 60 },
    duration_ms: 6500,
    brand: 'edge',
    css: css(
      '.fa{gap:0;align-items:stretch}',
      '.f-plate .fa-text{border:0;border-radius:0 6px 6px 0;background:linear-gradient(180deg,#1b1c22,#0c0d10);box-shadow:0 24px 48px -22px #000e;padding:20px 44px 34px 30px;clip-path:polygon(0 0,100% 0,calc(100% - 22px) 100%,0 100%)}',
      '.fa-text::after{content:"";position:absolute;left:0;right:0;bottom:0;height:14px;background:repeating-conic-gradient(#f5f5f7 0 25%,#0c0d10 0 50%) 0 0/14px 14px}',
      '.fa-text::before{content:"";position:absolute;left:0;top:0;width:100%;height:4px;background:linear-gradient(90deg,#a855f7,#00d2be)}',
      '.fa-body{font-family:"JetBrains Mono Variable",monospace;font-size:18px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#00d2be;opacity:1}',
      '.f-plate .fa-media{border-radius:6px 0 0 6px;box-shadow:none;height:auto;min-height:120px;background:#e10600}',
      '.fa-emblem{background:#e10600;color:#f5f5f7}',
      '.fa-emblem svg{opacity:0}',
      '.fa-media::after{content:"P1";position:absolute;inset:0;display:grid;place-items:center;font:italic 700 58px/1 "Oswald",sans-serif;color:#f5f5f7}',
      '.fa-spark.spot-edge{color:#f5f5f7}',
    ),
  },
  {
    raid: { title: 'Safety car: {name} brings {viewers_text}', duration_ms: 8000 },
    follow: { title: '{name} joins the grid' },
  },
  [
    {
      event: 'tip',
      id: 'tip-big',
      name: 'Big tips',
      condition: { type: 'amount_at_least', value: 1000, currency: null },
      look: { title: 'Fastest lap! {name} sends {amount}', duration_ms: 9000 },
    },
  ],
)

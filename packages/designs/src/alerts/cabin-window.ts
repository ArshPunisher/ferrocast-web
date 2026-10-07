// Cabin window: a cream card with a red Nordic knit band rises into view, a soft drift of
// snow resting on its top edge, the name glowing gold like a lit window. The art is a round
// pine-green ornament. The Spark hangs on the card's corner like a little bauble.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'cabin-window',
    name: 'Cabin window',
    description: 'A cream card with a red knit band, snow on its edge and a warm golden name.',
    style: 'cozy',
    motion: 'smooth',
  },
  {
    frame: 'plate',
    layout: 'above',
    media_size: 110,
    font: font('Playfair Display', 44, 800),
    colors: colors('#2a1a14', '#b3202f', '#f7eedf', '#ffc56b', '#2a1a14'),
    shadow: 'none',
    anim: motion('rise', 'sink', 'glow', 750, 500, 300),
    sound: { ref: null, builtin: 'chime', volume: 55 },
    duration_ms: 7000,
    brand: 'corner',
    css: css(
      '.fa{gap:0}',
      '.f-plate .fa-text{background:linear-gradient(180deg,#f7eedf,#efe2cc);border:0;border-radius:20px;padding:76px 46px 26px;min-width:440px;box-shadow:0 26px 50px -22px #000d,0 0 80px -30px #ffc56b88;margin-top:-34px}',
      '.fa-text::before{content:"";position:absolute;left:0;right:0;top:22px;height:40px;background:conic-gradient(from 135deg at 50% 0,#f7eedf 90deg,transparent 0) 0 0/16px 8px repeat-x,conic-gradient(from -45deg at 50% 100%,#f7eedf 90deg,transparent 0) 0 100%/16px 8px repeat-x,#b3202f}',
      '.fa-text::after{content:"";position:absolute;left:18px;right:18px;top:-12px;height:24px;border-radius:24px 24px 10px 10px;background:#ffffff;box-shadow:0 4px 0 #d7e2ee;animation:fc-drift .9s ease-out .5s both}',
      '@keyframes fc-drift{from{transform:scaleX(.3);opacity:0}}',
      '.fa-title{line-height:1.15}',
      '.fa-title .hl{text-shadow:0 0 22px #ffc56b}',
      '.fa-body{font-family:"Hanken Grotesk Variable",sans-serif;font-size:20px;font-weight:600;color:#6b4a3a;opacity:1}',
      '.f-plate .fa-media{z-index:1;border-radius:50%;overflow:visible;box-shadow:none}',
      '.fa-emblem{border-radius:50%;background:radial-gradient(circle at 34% 30%,#3d8a63,#173a2c 70%);color:#ffc56b;box-shadow:0 0 0 5px #f7eedf,0 14px 30px -12px #000c}',
      '.fa-emblem::before{content:"";position:absolute;top:-14px;left:50%;width:22px;height:16px;translate:-50% 0;border-radius:4px;background:#c99a2e}',
      '.fa-spark.spot-corner{color:#b3202f}',
    ),
  },
  {
    follow: { title: '{name} came in from the snow' },
    raid: { title: '{name} brought {viewers_text} in from the cold', duration_ms: 8000 },
  },
)

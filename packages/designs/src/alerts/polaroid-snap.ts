// Polaroid snap: a camera flash, then an instant photo flips in. The art fills the photo,
// the headline is handwritten on the white band under it. The Spark is a corner sticker.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'polaroid-snap',
    name: 'Polaroid snap',
    description: 'A camera flash, then an instant photo flips in with a handwritten caption.',
    style: 'cozy',
    motion: 'smooth',
  },
  {
    frame: 'none',
    layout: 'above',
    media_size: 230,
    font: font('Caveat', 44, 700),
    colors: colors('#2a2a2a', '#e8485f', '#fbfbf7', '#e8485f', '#2a2a2a'),
    shadow: 'none',
    anim: motion('flip', 'fade', 'none', 700, 450, 200),
    sound: { ref: null, builtin: 'whoosh', volume: 55 },
    duration_ms: 7000,
    brand: 'corner',
    css: css(
      '.fa{gap:0;background:#fbfbf7;padding:18px 18px 16px;rotate:-3deg;box-shadow:0 22px 40px -14px #000b;max-width:420px}',
      '.fa-media{border-radius:0;width:300px;height:230px}',
      '.fa-emblem{background:linear-gradient(160deg,#8fd3ff,#ffd6a5 60%,#ff9aa2)}',
      '.f-none .fa-text{padding:12px 6px 2px;max-width:300px}',
      '.fa-body{font-family:"Caveat",cursive;font-size:26px;font-weight:600;color:#444;opacity:1}',
      '.fa-stage::after{content:"";position:absolute;inset:0;background:#fff;opacity:0;animation:fc-flash .5s ease-out both}',
      '@keyframes fc-flash{0%{opacity:.9}}',
      '.fa-spark.spot-corner{right:-10px;top:-14px;color:#2a2a2a}',
    ),
  },
)

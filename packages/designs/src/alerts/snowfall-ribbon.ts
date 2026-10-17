// Snowfall ribbon: a gift card tied with a gold ribbon, snow drifting down past it, the
// name in script. Warm and festive for winter streams. The Spark sits in the ribbon knot.

import { alertDesign, colors, css, font, motion } from '../kit'

export default alertDesign(
  {
    slug: 'snowfall-ribbon',
    name: 'Snowfall ribbon',
    description: 'A gift card tied with a gold ribbon while snow drifts past. For winter streams.',
    style: 'cozy',
    motion: 'smooth',
  },
  {
    frame: 'plate',
    layout: 'left',
    media_size: 120,
    font: font('Pacifico', 40, 400),
    colors: colors('#ffffff', '#ffe08a', '#b3122e', '#e9c46a', '#5a0816'),
    shadow: 'soft',
    anim: motion('drop', 'sink', 'wave', 750, 500, 300),
    sound: { ref: null, builtin: 'chime', volume: 60 },
    duration_ms: 7000,
    brand: 'notch',
    css: css(
      '.f-plate .fa-text{background:linear-gradient(180deg,#c8173a,#8e0d24);border:0;border-radius:14px;padding:22px 44px 24px 54px;box-shadow:0 20px 34px -14px #000b;overflow:hidden}',
      '.fa-text::before{content:"";position:absolute;left:18px;top:0;bottom:0;width:14px;background:linear-gradient(180deg,#f6d27a,#c99a2e);opacity:.9}',
      '.fa-text::after{content:"";position:absolute;inset:-40px 0 0;background:radial-gradient(circle,#ffffffcc 2px,transparent 3px) 0 0/40px 40px,radial-gradient(circle,#ffffff88 1.5px,transparent 2.5px) 20px 14px/30px 30px;animation:fc-snow-a 6s linear both}',
      '@keyframes fc-snow-a{from{transform:translateY(-60px)}}',
      '.fa-title,.fa-body{position:relative;z-index:1}',
      '.fa-body{font-family:"Hanken Grotesk Variable",sans-serif;font-weight:600}',
      '.f-plate .fa-media{border-radius:14px;box-shadow:0 0 0 5px #fff}',
      '.fa-emblem{background:radial-gradient(circle at 35% 30%,#2fae6f,#14653e);color:#fff}',
      '.fa-spark.spot-notch{background:#c99a2e;border-color:#f6d27a;color:#5a0816}',
    ),
  },
)
